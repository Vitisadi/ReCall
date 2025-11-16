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
import { retroFonts, retroPalette, retroMenuItems } from '../styles/retroTheme';

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

const formatCountdown = (timestamp, eventDate) => {
   if (!timestamp) return null;
   const now = Date.now();
   const target = timestamp * 1000 || Date.parse(eventDate || '');
   if (!target || Number.isNaN(target)) return null;
   const diff = target - now;
   if (diff <= 0) return 'Today';
   const days = Math.floor(diff / 86400000);
   if (days === 0) {
      const hours = Math.ceil(diff / 3600000);
      return hours <= 1 ? 'In <1 hour' : `In ${hours} hours`;
   }
   if (days === 1) return 'Tomorrow';
   return `In ${days} days`;
};

const formatEventDate = (eventDate) => {
   if (!eventDate) return 'Upcoming';
   return new Date(eventDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
   });
};

export default function RetroHomeScreen({ onOpenConversation, onNavigateTab }) {
   const [nodes, setNodes] = useState([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState('');
   const [highlightsPreview, setHighlightsPreview] = useState([]);
   const [highlightsError, setHighlightsError] = useState('');
   const [highlightsLoading, setHighlightsLoading] = useState(true);
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

   useEffect(() => {
      let active = true;
      const fetchHighlightsPreview = async () => {
         try {
            setHighlightsLoading(true);
            setHighlightsError('');
            const res = await axios.get(`${BASE_URL}/api/highlights`);
            if (!active) return;
            const list = res.data?.highlights || [];
            setHighlightsPreview(list.slice(0, 3));
         } catch (err) {
            if (!active) return;
            setHighlightsError('Highlights are currently unavailable.');
         } finally {
            if (active) {
               setHighlightsLoading(false);
            }
         }
      };

      fetchHighlightsPreview();
      return () => {
         active = false;
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
      const baseSize = Math.max(48, width * 0.12);
      const maxSize = Math.min(120, width * 0.28);
      const placedNodes = [];
      const spacingPadding = Math.max(36, Math.min(width, graphHeight) * 0.08);
      const labelBuffer = 52;

      return sorted.map((node, index) => {
         const weight = node.conversationWeight || 0;
         const size =
            maxWeight === 0
               ? baseSize
               : baseSize +
                 ((maxSize - baseSize) * weight) / Math.max(maxWeight, 1);
         const radiusLimit = Math.max(
            0,
            Math.min(width, graphHeight) / 2 - size / 2 - spacingPadding
         );
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
         const maxY = Math.max(
            minY,
            graphHeight - spacingPadding - size / 2 - labelBuffer
         );
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
               const minDistance = (size + other.size) / 2 + spacingPadding;
               return distance < minDistance;
            });
            if (!overlaps) {
               placedX = candidateX;
               placedY = candidateY;
               break;
            }
         }

         placedX = clamp(placedX, minX, maxX);
         placedY = clamp(placedY, minY, maxY);

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

   const totalPeople = nodes.length;
   const totalSnippets = useMemo(
      () =>
         nodes.reduce(
            (sum, person) => sum + (person?.conversationWeight || 0),
            0
         ),
      [nodes]
   );

   const quickActions = [
      {
         label: 'Upload Memory',
         description: 'Process a new video',
         icon: '⬆️',
         onPress: () => onNavigateTab?.('upload'),
      },
      {
         label: 'Review Highlights',
         description: 'See upcoming events',
         icon: '✨',
         onPress: () => onNavigateTab?.('highlights'),
      },
      {
         label: 'Memory Library',
         description: 'Browse every person',
         icon: '📚',
         onPress: () => onNavigateTab?.('memory'),
      },
   ];

   const heroStats = [
      { label: 'People Logged', value: totalPeople },
      { label: 'Threads Logged', value: totalSnippets },
      { label: 'Upcoming Highlights', value: highlightsPreview.length },
   ];

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
                  <Text style={styles.heroEyebrow}>Command Center</Text>
                  <Text style={styles.heroTitle}>Welcome back</Text>
                  <Text style={styles.heroCopy}>
                     Review your orbit, follow up on upcoming highlights, and
                     keep every memory organized.
                  </Text>
                  <View style={styles.heroStatsRow}>
                     {heroStats.map((stat) => (
                        <View key={stat.label} style={styles.heroStat}>
                           <Text style={styles.heroStatValue}>
                              {stat.value.toLocaleString()}
                           </Text>
                           <Text style={styles.heroStatLabel}>
                              {stat.label}
                           </Text>
                        </View>
                     ))}
                  </View>
               </View>

               <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                     <Text style={styles.sectionTitle}>Quick Actions</Text>
                  </View>
                  <View style={styles.quickActions}>
                     {quickActions.map((action) => (
                        <TouchableOpacity
                           key={action.label}
                           style={styles.quickActionCard}
                           activeOpacity={0.9}
                           onPress={action.onPress}
                        >
                           <Text style={styles.quickActionIcon}>
                              {action.icon}
                           </Text>
                           <View style={styles.quickActionCopy}>
                              <Text style={styles.quickActionLabel}>
                                 {action.label}
                              </Text>
                              <Text style={styles.quickActionDescription}>
                                 {action.description}
                              </Text>
                           </View>
                        </TouchableOpacity>
                     ))}
                  </View>
               </View>

               <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                     <Text style={styles.sectionTitle}>Highlights Preview</Text>
                     <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => onNavigateTab?.('highlights')}
                     >
                        <Text style={styles.sectionLink}>View all</Text>
                     </TouchableOpacity>
                  </View>
                  {highlightsLoading ? (
                     <View style={styles.sectionLoading}>
                        <ActivityIndicator
                           size='small'
                           color={retroPalette.violet}
                        />
                        <Text style={styles.sectionLoadingText}>
                           Scanning highlights…
                        </Text>
                     </View>
                  ) : highlightsError ? (
                     <Text style={styles.sectionEmpty}>{highlightsError}</Text>
                  ) : highlightsPreview.length === 0 ? (
                     <Text style={styles.sectionEmpty}>
                        No highlights queued right now.
                     </Text>
                  ) : (
                     highlightsPreview.map((item) => (
                        <TouchableOpacity
                           key={`${item.id}-${item.person_name}`}
                           style={styles.highlightPreviewCard}
                           activeOpacity={0.9}
                           onPress={() =>
                              onOpenConversation?.({
                                 name: item.person_name,
                                 headline: item.person_headline,
                              })
                           }
                        >
                           <View style={styles.highlightHeader}>
                              <View>
                                 <Text style={styles.highlightName}>
                                    {item.person_name || 'Unknown'}
                                 </Text>
                                 <Text style={styles.highlightMeta}>
                                    {formatEventDate(item.event_date)}
                                    {item.category ? ` · ${item.category}` : ''}
                                 </Text>
                              </View>
                              {formatCountdown(
                                 item.event_timestamp,
                                 item.event_date
                              ) ? (
                                 <View style={styles.countdownPill}>
                                    <Text style={styles.countdownText}>
                                       {formatCountdown(
                                          item.event_timestamp,
                                          item.event_date
                                       )}
                                    </Text>
                                 </View>
                              ) : null}
                           </View>
                           <Text style={styles.highlightSummary}>
                              {item.summary || item.description}
                           </Text>
                        </TouchableOpacity>
                     ))
                  )}
               </View>

               <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                     <Text style={styles.sectionTitle}>Orbit Radar</Text>
                  </View>
                  {loading ? (
                     <View style={styles.sectionLoading}>
                        <ActivityIndicator
                           size='large'
                           color={retroPalette.violet}
                        />
                        <Text style={styles.sectionLoadingText}>
                           Mapping your people…
                        </Text>
                     </View>
                  ) : error ? (
                     <Text style={styles.sectionEmpty}>{error}</Text>
                  ) : preparedNodes.length === 0 ? (
                     <Text style={styles.sectionEmpty}>
                        Upload a video to enroll someone and start building the
                        network.
                     </Text>
                  ) : (
                     <>
                        <View
                           style={[
                              styles.graphWrapper,
                              { height: graphHeight },
                           ]}
                        >
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
                                       if (!onOpenConversation || !node?.name) {
                                          return;
                                       }
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
                                             {node.name?.[0]?.toUpperCase() ||
                                                '?'}
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
                                          ? `${node.share}% of memories`
                                          : '0% of memories'}
                                    </Text>
                                 </View>
                              </View>
                           ))}
                        </View>
                        <View style={styles.legend}>
                           <View style={styles.legendDot} />
                           <Text style={styles.legendText}>
                              Tap a face to jump into their latest conversation.
                           </Text>
                        </View>
                     </>
                  )}
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
      marginTop: 46,
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
      backgroundColor: 'transparent',
   },
   scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 32,
      gap: 18,
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
   heroEyebrow: {
      fontSize: 13,
      color: retroPalette.violet,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 6,
      fontFamily: baseMono,
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
   heroStatsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      rowGap: 12,
      marginTop: 20,
   },
   heroStat: {
      flexBasis: '30%',
      flexGrow: 1,
      backgroundColor: '#fbe9ff',
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      minWidth: 110,
   },
   heroStatValue: {
      fontSize: 22,
      fontWeight: '700',
      color: retroPalette.outline,
      textAlign: 'center',
      fontFamily: headingFont,
   },
   heroStatLabel: {
      fontSize: 12,
      color: retroPalette.violet,
      marginTop: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      flexWrap: 'wrap',
      textAlign: 'center',
      fontFamily: baseMono,
   },
   sectionCard: {
      backgroundColor: '#fff5dd',
      borderRadius: 24,
      padding: 20,
      borderWidth: 3,
      borderColor: retroPalette.outline,
      shadowColor: '#1b0f2c',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
   },
   sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
   },
   sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: retroPalette.outline,
      fontFamily: headingFont,
   },
   sectionLink: {
      fontSize: 14,
      fontWeight: '600',
      color: retroPalette.teal,
      fontFamily: baseMono,
   },
   quickActions: {
      gap: 12,
   },
   quickActionCard: {
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 18,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#fdf1ff',
      shadowColor: '#1b0f2c',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
   },
   quickActionIcon: {
      fontSize: 22,
      marginRight: 12,
   },
   quickActionCopy: {
      flex: 1,
   },
   quickActionLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: retroPalette.outline,
      fontFamily: headingFont,
   },
   quickActionDescription: {
      fontSize: 13,
      color: retroPalette.plum,
      marginTop: 2,
      fontFamily: baseMono,
   },
   sectionLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
   },
   sectionLoadingText: {
      fontSize: 14,
      color: retroPalette.plum,
      fontFamily: baseMono,
   },
   sectionEmpty: {
      fontSize: 14,
      color: retroPalette.plum,
      fontFamily: baseMono,
   },
   highlightPreviewCard: {
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      backgroundColor: '#fffdf0',
   },
   highlightHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
   },
   highlightName: {
      fontSize: 16,
      fontWeight: '600',
      color: retroPalette.outline,
      fontFamily: headingFont,
   },
   highlightMeta: {
      fontSize: 13,
      color: retroPalette.violet,
      marginTop: 2,
      fontFamily: baseMono,
   },
   highlightSummary: {
      fontSize: 14,
      color: retroPalette.plum,
      lineHeight: 20,
      fontFamily: baseMono,
   },
   countdownPill: {
      borderRadius: 999,
      backgroundColor: '#fef1bc',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   countdownText: {
      fontSize: 12,
      fontWeight: '600',
      color: retroPalette.outline,
      textTransform: 'uppercase',
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
