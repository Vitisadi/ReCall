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
      <View style={styles.screen}>
         <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
         >
            <LinearGradient
               colors={['#111827', '#1e3a8a']}
               start={{ x: 0, y: 0 }}
               end={{ x: 1, y: 1 }}
               style={styles.heroCard}
            >
               <Text style={styles.heroTitle}>Meet your orbit</Text>
               <Text style={styles.heroCopy}>
                  Each bubble is a person you have spoken with. Tap any face to
                  open their latest conversation.
               </Text>
            </LinearGradient>

            {loading ? (
               <View style={styles.loadingState}>
                  <ActivityIndicator size='large' color='#007AFF' />
                  <Text style={styles.loadingText}>Mapping your people…</Text>
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
                           onPress={() =>
                              onOpenConversation &&
                              node?.name &&
                              onOpenConversation(node.name)
                           }
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
   );
}

const styles = StyleSheet.create({
   screen: {
      flex: 1,
      backgroundColor: '#f8fafc',
   },
   scrollContent: {
      paddingHorizontal: 20,
      marginTop: 36,
      paddingBottom: 24,
   },
   heroCard: {
      borderRadius: 26,
      padding: 24,
      marginTop: 36,
      marginBottom: 0,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
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
      color: '#fff',
      fontWeight: '700',
      marginBottom: 8,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   heroCopy: {
      color: '#cbd5f5',
      fontSize: 15,
      lineHeight: 22,
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
      color: '#475467',
      fontSize: 16,
   },
   errorState: {
      padding: 20,
      borderRadius: 12,
      backgroundColor: '#fee2e2',
   },
   errorText: {
      color: '#991b1b',
      fontSize: 16,
      textAlign: 'center',
   },
   emptyState: {
      padding: 32,
      borderRadius: 18,
      backgroundColor: '#e0f2fe',
      alignItems: 'center',
   },
   emptyTitle: {
      fontSize: 20,
      color: '#0f172a',
      fontWeight: '700',
      marginBottom: 6,
   },
   emptyCopy: {
      color: '#0f172a',
      textAlign: 'center',
   },
   graphWrapper: {
      marginTop: 24,
      borderRadius: 24,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#e4e7ec',
      overflow: 'hidden',
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
      borderColor: '#fff',
      backgroundColor: '#d9e2ec',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 6,
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
      backgroundColor: '#c7d2fe',
   },
   nodeFallbackText: {
      fontSize: 42,
      color: '#1d1d1f',
      fontWeight: '700',
   },
   nodeLabel: {
      marginTop: 8,
      alignItems: 'center',
   },
   nodeName: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0f172a',
      textTransform: 'capitalize',
   },
   nodeMeta: {
      fontSize: 12,
      color: '#475467',
   },
   legend: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 24,
      padding: 12,
      borderRadius: 12,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#e4e7ec',
   },
   legendDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: '#007AFF',
      marginRight: 12,
   },
   legendText: {
      flex: 1,
      color: '#0f172a',
      fontSize: 14,
   },
});
