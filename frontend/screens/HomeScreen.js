import React, { useEffect, useMemo, useState } from 'react';
import {
   View,
   Text,
   StyleSheet,
   Platform,
   ScrollView,
   ActivityIndicator,
   Image,
   TouchableOpacity,
   useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { BASE_URL } from '../config';
import {
   retroFonts,
   retroPalette,
   retroMenuItems,
} from '../styles/retroTheme';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const computeConversationWeight = (conversation) => {
   if (!Array.isArray(conversation)) return 0;
   return conversation.reduce((total, entry) => {
      if (Array.isArray(entry?.conversation)) {
         return total + entry.conversation.length;
      }
      return total;
   }, 0);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const createSeededRandom = (seedStr) => {
   let hash = 0;
   for (let i = 0; i < seedStr.length; i += 1) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
   }
   let seed = hash >>> 0;
   return () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0xffffffff;
   };
};

export default function HomeScreen({ onOpenConversation }) {
   const [nodes, setNodes] = useState([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState('');
   const { width } = useWindowDimensions();
   const graphHeight = Math.max(420, width * 0.9);

   useEffect(() => {
      let isMounted = true;

      const fetchGraphData = async () => {
         setLoading(true);
         setError('');
         try {
            const peopleRes = await axios.get(`${BASE_URL}/api/people`);
            const people = Array.isArray(peopleRes.data) ? peopleRes.data : [];

            const enriched = await Promise.all(
               people.map(async (person) => {
                  if (!person?.name) {
                     return { ...person, conversationWeight: 0 };
                  }
                  try {
                     const convRes = await axios.get(
                        `${BASE_URL}/api/conversation/${encodeURIComponent(
                           person.name
                        )}`
                     );
                     const conversation = convRes.data?.conversation || [];
                     return {
                        ...person,
                        conversationWeight:
                           computeConversationWeight(conversation),
                     };
                  } catch (convError) {
                     console.warn(
                        'Conversation fetch failed',
                        person?.name,
                        convError?.response?.data || convError.message
                     );
                     return { ...person, conversationWeight: 0 };
                  }
               })
            );

            if (isMounted) {
               setNodes(enriched);
            }
         } catch (fetchError) {
            console.error('People fetch failed', fetchError.message);
            if (isMounted) {
               setError(
                  'We could not load your contacts. Check your connection and try again.'
               );
            }
         } finally {
            if (isMounted) {
               setLoading(false);
            }
         }
      };

      fetchGraphData();

      return () => {
         isMounted = false;
      };
   }, []);

   const preparedNodes = useMemo(() => {
      if (!nodes.length) return [];
      const sorted = [...nodes].sort(
         (a, b) => (b.conversationWeight || 0) - (a.conversationWeight || 0)
      );
      const maxWeight = sorted[0]?.conversationWeight || 0;
      const totalWeight = sorted.reduce(
         (sum, person) => sum + (person.conversationWeight || 0),
         0
      );
      const baseSize = 70;
      const maxSize = Math.min(150, width * 0.35);
      const placedNodes = [];
      const spacingPadding = Math.max(18, Math.min(width, graphHeight) * 0.04);

      return sorted.map((node, index) => {
         const weight = node.conversationWeight || 0;
         const size =
            maxWeight === 0
               ? baseSize
               : baseSize +
                 ((maxSize - baseSize) * weight) / Math.max(maxWeight, 1);
         const radiusLimit = Math.min(width, graphHeight) / 2 - size / 2 - 16;
         const ratio =
            sorted.length === 1
               ? 0
               : Math.sqrt(index + 1) / Math.sqrt(sorted.length);
         const radius = clamp(ratio * radiusLimit, 0, Math.max(radiusLimit, 0));
         const angle = index * GOLDEN_ANGLE;
         const centerX = width / 2;
         const centerY = graphHeight / 2;
         const normalizedOffset =
            sorted.length <= 1 ? 0 : index / (sorted.length - 1) - 0.5;
         const fallbackX = clamp(
            centerX +
               radius * Math.cos(angle) +
               normalizedOffset * width * 0.18,
            size / 2,
            width - size / 2
         );
         const fallbackY = clamp(
            centerY + radius * Math.sin(angle),
            size / 2,
            graphHeight - size / 2
         );

         const seededRand = createSeededRandom(
            `${node.name || 'node'}-${index}`
         );
         const minX = spacingPadding + size / 2;
         const maxX = Math.max(minX, width - spacingPadding - size / 2);
         const minY = spacingPadding + size / 2;
         const maxY = Math.max(minY, graphHeight - spacingPadding - size / 2);
         const availableWidth = Math.max(0, maxX - minX);
         const availableHeight = Math.max(0, maxY - minY);

         let placedX = fallbackX;
         let placedY = fallbackY;
         const maxAttempts = 80;

         for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const candidateX = minX + seededRand() * availableWidth;
            const candidateY = minY + seededRand() * availableHeight;
            const overlaps = placedNodes.some((other) => {
               const dx = candidateX - other.x;
               const dy = candidateY - other.y;
               const distance = Math.sqrt(dx * dx + dy * dy);
               const minDistance =
                  (size + other.size) / 2 + spacingPadding;
               return distance < minDistance;
            });
            if (!overlaps) {
               placedX = candidateX;
               placedY = candidateY;
               break;
            }
         }

         placedNodes.push({ x: placedX, y: placedY, size });

         return {
            ...node,
            size,
            x: placedX,
            y: placedY,
            share:
               totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0,
         };
      });
   }, [nodes, width, graphHeight]);

   return (
      <LinearGradient
         colors={[retroPalette.sunsetStart, retroPalette.sunsetEnd]}
         style={styles.gradient}
      >
         <View style={styles.window}>
            <View style={styles.menuBar}>
               {retroMenuItems.map((item) => (
                  <Text key={item} style={styles.menuItem}>
                     {item}
                  </Text>
               ))}
               <View style={styles.menuLed} />
            </View>
            <ScrollView
               style={styles.windowBody}
               contentContainerStyle={styles.scrollContent}
               showsVerticalScrollIndicator={false}
            >
               <View style={styles.heroCard}>
                  <Text style={styles.heroTitle}>Meet your orbit</Text>
                  <Text style={styles.heroCopy}>
                     Each bubble is a person you have spoken with. Tap any face
                     to open their latest conversation.
                  </Text>
               </View>

               {loading ? (
                  <View style={styles.loadingState}>
                     <ActivityIndicator
                        size='large'
                        color={retroPalette.violet}
                     />
                     <Text style={styles.loadingText}>
                        Mapping your people…
                     </Text>
                  </View>
               ) : error ? (
                  <View style={styles.errorState}>
                     <Text style={styles.errorText}>{error}</Text>
                  </View>
               ) : preparedNodes.length === 0 ? (
                  <View style={styles.emptyState}>
                     <Text style={styles.emptyTitle}>No faces yet</Text>
                     <Text style={styles.emptyCopy}>
                        Upload a video to enroll someone and start building the
                        network.
                     </Text>
                  </View>
               ) : (
                  <View style={[styles.graphWrapper, { height: graphHeight }]}>
                     {preparedNodes.map((node) => (
                        <View
                           key={node.name}
                           style={[
                              styles.nodeWrapper,
                              {
                                 left: node.x - node.size / 2,
                                 top: node.y - node.size / 2,
                                 width: node.size,
                                 height: node.size,
                              },
                           ]}
                        >
                           <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => {
                                 if (!onOpenConversation || !node?.name) return;
                                 onOpenConversation({
                                    name: node.name,
                                    avatarUrl: node.image_url,
                                    headline: node.headline,
                                 });
                              }}
                              style={[
                                 styles.nodeTouchable,
                                 {
                                    borderRadius: node.size / 2,
                                 },
                              ]}
                           >
                              {node.image_url ? (
                                 <Image
                                    source={{ uri: node.image_url }}
                                    style={styles.nodeImage}
                                 />
                              ) : (
                                 <View style={styles.nodeFallback}>
                                    <Text style={styles.nodeFallbackText}>
                                       {node.name?.[0]?.toUpperCase() || '?'}
                                    </Text>
                                 </View>
                              )}
                           </TouchableOpacity>
                           <View style={styles.nodeLabel}>
                              <Text style={styles.nodeName}>
                                 {node.name || 'Unknown'}
                              </Text>
                              <Text style={styles.nodeMeta}>
                                 {node.share
                                    ? `${node.share}% of memory`
                                    : '0% of memory'}
                              </Text>
                           </View>
                        </View>
                     ))}
                  </View>
               )}

               <View style={styles.legend}>
                  <View style={styles.legendDot} />
                  <Text style={styles.legendText}>
                     Tap a face to jump into their latest conversation.
                  </Text>
               </View>
            </ScrollView>
         </View>
      </LinearGradient>
   );
}

const baseMono = retroFonts.base;
const headingFont = retroFonts.heading;

const styles = StyleSheet.create({
   gradient: { flex: 1 },
   window: {
      flex: 1,
      margin: 12,
      borderRadius: 24,
      borderWidth: 3,
      borderColor: retroPalette.outline,
      backgroundColor: retroPalette.warmSand,
      shadowColor: '#1b0f2c',
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      overflow: 'hidden',
   },
   menuBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: retroPalette.menuGray,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: retroPalette.outline,
   },
   menuItem: {
      marginRight: 18,
      fontSize: 13,
      color: retroPalette.menuText,
      fontFamily: headingFont,
      letterSpacing: 1,
      textTransform: 'uppercase',
   },
   menuLed: {
      marginLeft: 'auto',
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: retroPalette.teal,
      borderWidth: 1,
      borderColor: retroPalette.outline,
   },
   windowBody: {
      flex: 1,
   },
   scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 32,
   },
   heroCard: {
      borderRadius: 28,
      padding: 24,
      marginBottom: 12,
      borderWidth: 3,
      borderColor: retroPalette.outline,
      backgroundColor: '#fff0f5',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
   },
   heroBadge: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.15)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginBottom: 16,
   },
   heroBadgeText: {
      color: '#c7d2fe',
      fontWeight: '600',
      letterSpacing: 0.6,
      fontSize: 12,
      textTransform: 'uppercase',
   },
   heroTitle: {
      fontSize: 30,
      color: retroPalette.outline,
      fontWeight: '700',
      marginBottom: 8,
      fontFamily: headingFont,
      textTransform: 'uppercase',
   },
   heroCopy: {
      color: retroPalette.plum,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: baseMono,
   },
   subtitle: {
      fontSize: 16,
      color: '#475467',
      marginBottom: 24,
      lineHeight: 22,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   loadingState: {
      alignItems: 'center',
      paddingVertical: 60,
   },
   loadingText: {
      marginTop: 12,
      color: retroPalette.plum,
      fontSize: 16,
      fontFamily: baseMono,
   },
   errorState: {
      padding: 20,
      borderRadius: 20,
      backgroundColor: '#ffd9e1',
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   errorText: {
      color: retroPalette.coral,
      fontSize: 16,
      textAlign: 'center',
      fontFamily: baseMono,
   },
   emptyState: {
      padding: 32,
      borderRadius: 22,
      backgroundColor: '#fffbe2',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: retroPalette.outline,
      shadowColor: '#2c0d38',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
   },
   emptyTitle: {
      fontSize: 20,
      color: retroPalette.outline,
      fontWeight: '700',
      marginBottom: 6,
      fontFamily: headingFont,
   },
   emptyCopy: {
      color: retroPalette.plum,
      textAlign: 'center',
      fontFamily: baseMono,
   },
   graphWrapper: {
      marginTop: 24,
      borderRadius: 28,
      backgroundColor: '#fff5dd',
      borderWidth: 3,
      borderColor: retroPalette.outline,
      overflow: 'hidden',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
   },
   nodeWrapper: {
      position: 'absolute',
      alignItems: 'center',
   },
   nodeTouchable: {
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      borderWidth: 3,
      borderColor: retroPalette.outline,
      backgroundColor: '#f5d0ff',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.2,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 8,
      elevation: 6,
   },
   nodeImage: {
      width: '100%',
      height: '100%',
   },
   nodeFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: retroPalette.lilac,
   },
   nodeFallbackText: {
      fontSize: 42,
      color: retroPalette.outline,
      fontWeight: '700',
      fontFamily: headingFont,
   },
   nodeLabel: {
      marginTop: 8,
      alignItems: 'center',
      paddingHorizontal: 6,
      backgroundColor: '#fff3f9',
      borderRadius: 12,
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   nodeName: {
      fontSize: 16,
      fontWeight: '700',
      color: retroPalette.outline,
      textTransform: 'capitalize',
      fontFamily: headingFont,
   },
   nodeMeta: {
      fontSize: 12,
      color: retroPalette.violet,
      fontFamily: baseMono,
   },
   legend: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 24,
      padding: 12,
      borderRadius: 18,
      backgroundColor: '#fffbe2',
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   legendDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: retroPalette.violet,
      marginRight: 12,
   },
   legendText: {
      flex: 1,
      color: retroPalette.plum,
      fontSize: 14,
      fontFamily: baseMono,
   },
});
