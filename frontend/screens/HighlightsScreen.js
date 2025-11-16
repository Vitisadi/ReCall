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
import { BASE_URL } from '../config';

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

export default function HighlightsScreen({ onOpenConversation }) {
   const [highlights, setHighlights] = useState([]);
   const [loading, setLoading] = useState(true);
   const [refreshing, setRefreshing] = useState(false);
   const [error, setError] = useState('');
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

   const handleRefresh = useCallback(() => {
      setRefreshing(true);
      fetchHighlights(true);
   }, [fetchHighlights]);

   const handleOpenPerson = useCallback(
      (item) => {
         if (!item?.person_name || typeof onOpenConversation !== 'function')
            return;
          onOpenConversation({
             name: item.person_name,
             headline: item.person_headline,
             avatarUrl: item.person_image_url || item.image_url,
          });
      },
      [onOpenConversation]
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
               <Text style={styles.personName}>
                  {item.person_name || 'Unknown'}
               </Text>
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

   if (loading && !refreshing && highlights.length === 0 && !error) {
      return (
         <View style={styles.loadingState}>
            <ActivityIndicator color='#007AFF' size='large' />
            <Text style={styles.loadingCopy}>Scanning for highlights…</Text>
         </View>
      );
   }

   return (
      <View style={styles.screen}>
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
      </View>
   );
}

const styles = StyleSheet.create({
   screen: {
      flex: 1,
      backgroundColor: '#f7f7f7',
      paddingTop: 40,
   },
   headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
      marginTop: 36,
   },
   header: {
      fontSize: 22,
      marginTop: 36,
      fontWeight: '700',
      color: '#111',
   },
   refreshButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#e4e9ff',
      alignItems: 'center',
      justifyContent: 'center',
   },
   refreshLabel: {
      fontSize: 18,
      color: '#4a63ff',
      fontWeight: '700',
   },
   listContent: {
      paddingHorizontal: 20,
      paddingBottom: 80,
   },
   emptyContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
   },
   card: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
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
      color: '#07203f',
   },
   countdownPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: '#eef3ff',
   },
   countdownText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#1f4eff',
      textTransform: 'uppercase',
   },
   summary: {
      fontSize: 16,
      fontWeight: '600',
      color: '#111',
   },
   eventDate: {
      fontSize: 14,
      color: '#4a4a4a',
      marginBottom: 6,
   },
   description: {
      fontSize: 14,
      color: '#333',
      marginBottom: 6,
   },
   quote: {
      fontStyle: 'italic',
      color: '#666',
      marginBottom: 8,
   },
   metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2,
   },
   metaText: {
      fontSize: 12,
      color: '#777',
   },
   actionsRow: {
      flexDirection: 'row',
      marginTop: 12,
   },
   actionButton: {
      flex: 1,
      borderRadius: 999,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 4,
   },
   completeButton: {
      backgroundColor: '#0d9b6c',
   },
   dismissButton: {
      backgroundColor: '#f05a4f',
   },
   actionButtonText: {
      color: '#fff',
      fontWeight: '700',
      textTransform: 'uppercase',
      fontSize: 13,
   },
   actionButtonDisabled: {
      opacity: 0.55,
   },
   loadingState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
   },
   loadingCopy: {
      marginTop: 12,
      fontSize: 15,
      color: '#555',
   },
   errorText: {
      color: '#c0392b',
      marginHorizontal: 20,
      marginBottom: 8,
   },
   emptyState: {
      alignItems: 'center',
      paddingHorizontal: 16,
   },
   emptyHeader: {
      fontSize: 18,
      fontWeight: '600',
      color: '#222',
      marginBottom: 6,
   },
   emptyCopy: {
      fontSize: 14,
      color: '#666',
      textAlign: 'center',
   },
});
