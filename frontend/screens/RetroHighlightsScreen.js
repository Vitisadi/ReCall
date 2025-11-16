import React, { useCallback, useEffect, useState } from 'react';
import {
   ActivityIndicator,
   FlatList,
   RefreshControl,
   StyleSheet,
   Text,
   TouchableOpacity,
   View,
} from 'react-native';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { BASE_URL } from '../config';
import { retroFonts, retroPalette, retroMenuItems } from '../styles/retroTheme';

const formatEventDate = (iso) => {
   if (!iso) return 'Unknown date';
   const date = new Date(iso);
   if (Number.isNaN(date.getTime())) return iso;
   return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
   });
};

const formatCountdown = (timestamp, fallbackIso) => {
   let targetMs = 0;
   if (typeof timestamp === 'number') {
      targetMs = timestamp * 1000;
   } else if (fallbackIso) {
      const parsed = Date.parse(fallbackIso);
      if (!Number.isNaN(parsed)) {
         targetMs = parsed;
      }
   }

   if (!targetMs) return '';
   const diff = targetMs - Date.now();
   if (diff <= 0) {
      return 'Today';
   }
   const days = Math.floor(diff / 86400000);
   if (days === 0) {
      const hours = Math.ceil(diff / 3600000);
      return hours <= 1 ? 'In <1 hour' : `In ${hours} hours`;
   }
   if (days === 1) return 'Tomorrow';
   return `In ${days} days`;
};

export default function RetroHighlightsScreen({ onOpenConversation }) {
   const [highlights, setHighlights] = useState([]);
   const [loading, setLoading] = useState(true);
   const [refreshing, setRefreshing] = useState(false);
   const [error, setError] = useState('');
   const [peopleIndex, setPeopleIndex] = useState({});
   const [actioning, setActioning] = useState(null);

   const fetchHighlights = useCallback(async (silent = false) => {
      if (!silent) {
         setLoading(true);
      }
      setError('');
      try {
         const res = await axios.get(`${BASE_URL}/api/highlights`);
         setHighlights(res.data?.highlights || []);
      } catch (err) {
         console.warn('Failed to load highlights', err?.message || err);
         setError('Could not load highlights. Pull to retry.');
      } finally {
         setLoading(false);
         setRefreshing(false);
      }
   }, []);

   useEffect(() => {
      fetchHighlights();
   }, [fetchHighlights]);

   useEffect(() => {
      let active = true;
      axios
         .get(`${BASE_URL}/api/people`)
         .then((res) => {
            if (!active) return;
            const index = {};
            (res.data || []).forEach((person) => {
               if (person?.name) {
                  index[person.name.toLowerCase()] = person;
               }
            });
            setPeopleIndex(index);
         })
         .catch(() => {});
      return () => {
         active = false;
      };
   }, []);

   const handleRefresh = useCallback(() => {
      setRefreshing(true);
      fetchHighlights(true);
   }, [fetchHighlights]);

   const handleOpenPerson = useCallback(
      (item) => {
         if (!item?.person_name || typeof onOpenConversation !== 'function')
            return;
         const key = item.person_name.toLowerCase();
         const personRecord = peopleIndex[key];
         onOpenConversation({
            name: item.person_name,
            headline: item.person_headline || personRecord?.headline,
            avatarUrl:
               item.person_image_url ||
               item.image_url ||
               personRecord?.image_url,
         });
      },
      [onOpenConversation, peopleIndex]
   );

   const handleUpdateStatus = useCallback(async (highlightId, status) => {
      if (!highlightId || !status) return;
      setActioning({ id: highlightId, status });
      setError('');
      try {
         await axios.patch(`${BASE_URL}/api/highlights/${highlightId}`, {
            status,
         });
         setHighlights((prev) =>
            prev.filter((item) => item.id !== highlightId)
         );
      } catch (err) {
         const message =
            err?.response?.data?.error ||
            'Unable to update highlight right now.';
         setError(message);
      } finally {
         setActioning(null);
      }
   }, []);

   const renderHighlight = ({ item }) => {
      const displayName = item.person_name
         ? item.person_name
              .split(' ')
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(' ')
         : 'Unknown';
      const countdown = formatCountdown(item.event_timestamp, item.event_date);
      const isActioning = actioning?.id === item.id;
      const workingStatus = isActioning ? actioning?.status : '';
      const disableActions = Boolean(isActioning);
      return (
         <TouchableOpacity
            style={styles.card}
            activeOpacity={0.92}
            onPress={() => handleOpenPerson(item)}
         >
            <View style={styles.cardHeader}>
               <Text style={styles.personName}>{displayName}</Text>
               {countdown ? (
                  <View style={styles.countdownPill}>
                     <Text style={styles.countdownText}>{countdown}</Text>
                  </View>
               ) : null}
            </View>
            <Text style={styles.summary}>{item.summary}</Text>
            <Text style={styles.eventDate}>
               {formatEventDate(item.event_date)}
               {item.category ? ` · ${item.category}` : ''}
            </Text>
            {item.description ? (
               <Text style={styles.description}>{item.description}</Text>
            ) : null}
            {item.source_quote ? (
               <Text style={styles.quote}>“{item.source_quote}”</Text>
            ) : null}
            <View style={styles.metaRow}>
               <Text style={styles.metaText}>
                  Confidence: {Math.round((item.confidence || 0) * 100)}%
               </Text>
               <Text style={styles.metaText}>Tap card to jump to convo</Text>
            </View>
            <View style={styles.actionsRow}>
               <TouchableOpacity
                  style={[
                     styles.actionButton,
                     styles.completeButton,
                     disableActions ? styles.actionButtonDisabled : null,
                  ]}
                  activeOpacity={0.85}
                  disabled={disableActions}
                  onPress={() => handleUpdateStatus(item.id, 'completed')}
               >
                  <Text style={styles.actionButtonText}>
                     {isActioning && workingStatus === 'completed'
                        ? 'Completing…'
                        : 'Complete'}
                  </Text>
               </TouchableOpacity>
               <TouchableOpacity
                  style={[
                     styles.actionButton,
                     styles.dismissButton,
                     disableActions ? styles.actionButtonDisabled : null,
                  ]}
                  activeOpacity={0.85}
                  disabled={disableActions}
                  onPress={() => handleUpdateStatus(item.id, 'dismissed')}
               >
                  <Text style={styles.actionButtonText}>
                     {isActioning && workingStatus === 'dismissed'
                        ? 'Dismissing…'
                        : 'Dismiss'}
                  </Text>
               </TouchableOpacity>
            </View>
         </TouchableOpacity>
      );
   };

   const renderChrome = (children) => (
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
            <View style={styles.windowBody}>{children}</View>
         </View>
      </LinearGradient>
   );

   if (loading && !refreshing && highlights.length === 0 && !error) {
      return renderChrome(
         <View style={styles.loadingState}>
            <ActivityIndicator color={retroPalette.violet} size='large' />
            <Text style={styles.loadingCopy}>Scanning for highlights…</Text>
         </View>
      );
   }

   return renderChrome(
      <>
         <View style={styles.headerRow}>
            <Text style={styles.header}>Upcoming Highlights</Text>
            <TouchableOpacity
               style={styles.refreshButton}
               onPress={() => fetchHighlights()}
            >
               <Text style={styles.refreshLabel}>↻</Text>
            </TouchableOpacity>
         </View>
         {error ? <Text style={styles.errorText}>{error}</Text> : null}
         <FlatList
            data={highlights}
            keyExtractor={(item) => item.id || item.summary}
            renderItem={renderHighlight}
            contentContainerStyle={
               highlights.length === 0
                  ? styles.emptyContainer
                  : styles.listContent
            }
            refreshControl={
               <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
               />
            }
            ListEmptyComponent={
               !loading && (
                  <View style={styles.emptyState}>
                     <Text style={styles.emptyHeader}>No reminders yet</Text>
                     <Text style={styles.emptyCopy}>
                        Once ReCall spots future events in your conversations,
                        they’ll appear here with quick links back to the person.
                     </Text>
                  </View>
               )
            }
         />
      </>
   );
}

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
      shadowOpacity: 0.32,
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
      fontFamily: retroFonts.heading,
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
      padding: 18,
   },
   headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 12,
      marginTop: 8,
   },
   header: {
      fontSize: 26,
      fontWeight: '700',
      color: retroPalette.outline,
      fontFamily: retroFonts.heading,
      textTransform: 'uppercase',
   },
   refreshButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      backgroundColor: '#f4c9ff',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
   },
   refreshLabel: {
      fontSize: 20,
      color: retroPalette.violet,
      fontWeight: '700',
      fontFamily: retroFonts.heading,
   },
   listContent: {
      paddingHorizontal: 4,
      paddingBottom: 80,
   },
   emptyContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
   },
   card: {
      backgroundColor: '#fff5dd',
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      shadowColor: '#2c0d38',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
   },
   cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
   },
   personName: {
      fontSize: 18,
      fontWeight: '700',
      color: retroPalette.outline,
      fontFamily: retroFonts.heading,
   },
   countdownPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: '#f7d6ff',
      borderWidth: 1,
      borderColor: retroPalette.outline,
   },
   countdownText: {
      fontSize: 12,
      fontWeight: '600',
      color: retroPalette.violet,
      fontFamily: retroFonts.base,
      textTransform: 'uppercase',
   },
   summary: {
      fontSize: 16,
      fontWeight: '600',
      color: retroPalette.plum,
      fontFamily: retroFonts.base,
   },
   eventDate: {
      fontSize: 14,
      color: retroPalette.violet,
      marginBottom: 6,
      fontFamily: retroFonts.base,
   },
   description: {
      fontSize: 14,
      color: retroPalette.plum,
      marginBottom: 6,
      fontFamily: retroFonts.base,
   },
   quote: {
      fontStyle: 'italic',
      color: retroPalette.violet,
      marginBottom: 8,
      fontFamily: retroFonts.base,
   },
   metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2,
   },
   metaText: {
      fontSize: 12,
      color: retroPalette.plum,
      fontFamily: retroFonts.base,
   },
   actionsRow: {
      flexDirection: 'row',
      marginTop: 12,
   },
   actionButton: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 4,
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   completeButton: {
      backgroundColor: retroPalette.teal,
   },
   dismissButton: {
      backgroundColor: retroPalette.coral,
   },
   actionButtonText: {
      color: '#fff',
      fontWeight: '700',
      textTransform: 'uppercase',
      fontSize: 13,
      fontFamily: retroFonts.heading,
   },
   actionButtonDisabled: {
      opacity: 0.55,
   },
   loadingState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
   },
   loadingCopy: {
      marginTop: 12,
      fontSize: 15,
      color: retroPalette.menuText,
      fontFamily: retroFonts.base,
   },
   errorText: {
      color: retroPalette.coral,
      marginHorizontal: 12,
      marginBottom: 8,
      fontFamily: retroFonts.base,
   },
   emptyState: {
      alignItems: 'center',
      paddingHorizontal: 16,
   },
   emptyHeader: {
      fontSize: 18,
      fontWeight: '600',
      color: retroPalette.outline,
      fontFamily: retroFonts.heading,
      marginBottom: 6,
   },
   emptyCopy: {
      fontSize: 14,
      color: retroPalette.plum,
      textAlign: 'center',
      fontFamily: retroFonts.base,
   },
});
