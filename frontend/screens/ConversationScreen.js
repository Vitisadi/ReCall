import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
   View,
   Text,
   FlatList,
   TouchableOpacity,
   StyleSheet,
   ActivityIndicator,
   Platform,
} from 'react-native';
import axios from 'axios';
import { BASE_URL } from '../config';

export default function ConversationScreen({
   name,
   highlightTimestamp,
   highlightIndex,
   onBack,
}) {
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState(null);
   const [data, setData] = useState([]);
   const listRef = useRef(null);

   useEffect(() => {
      let mounted = true;
      setLoading(true);
      axios
         .get(`${BASE_URL}/api/conversation/${name}`)
         .then((res) => {
            if (!mounted) return;
            // API returns { name, conversation } or 404
            setData(res.data.conversation || []);
            setError(null);
         })
         .catch((err) => {
            console.error('Conversation fetch error:', err);
            if (!mounted) return;
            setError(err.message || 'Failed to load conversation');
         })
         .finally(() => mounted && setLoading(false));

      return () => {
         mounted = false;
      };
   }, [name]);

   const scrollToHighlight = useCallback(() => {
      if (!highlightTimestamp || !data.length || !listRef.current) return;
      const entryIndex = data.findIndex(
         (entry) => entry.timestamp === highlightTimestamp
      );
      if (entryIndex < 0) return;

      requestAnimationFrame(() => {
         listRef.current?.scrollToIndex({
            index: entryIndex,
            animated: true,
         });
      });
   }, [data, highlightTimestamp]);

   useEffect(() => {
      scrollToHighlight();
   }, [scrollToHighlight]);

   const renderEntry = ({ item }) => {
      // item is expected to be { timestamp, conversation }
      const ts = item.timestamp
         ? new Date(item.timestamp * 1000).toLocaleString()
         : '';
      const isHighlightedEntry =
         Boolean(highlightTimestamp) && item.timestamp === highlightTimestamp;
      const messageHighlightIndex =
         isHighlightedEntry && Number.isInteger(highlightIndex)
            ? highlightIndex
            : -1;

      return (
         <View
            style={[styles.entry, isHighlightedEntry && styles.entryHighlight]}
         >
            <Text style={styles.ts}>{ts}</Text>
            {Array.isArray(item.conversation) ? (
               item.conversation.map((m, i) => {
                  // m may be a string or an object like { speaker, text }
                  if (typeof m === 'string') {
                     return (
                        <Text
                           key={i}
                           style={[
                              styles.msg,
                              isHighlightedEntry &&
                                 i === messageHighlightIndex &&
                                 styles.msgHighlight,
                           ]}
                        >
                           {m}
                        </Text>
                     );
                  }
                  if (m && typeof m === 'object') {
                     const speaker = m.speaker ? `${m.speaker}: ` : '';
                     const text = m.text != null ? m.text : JSON.stringify(m);
                     return (
                        <Text
                           key={i}
                           style={[
                              styles.msg,
                              isHighlightedEntry &&
                                 i === messageHighlightIndex &&
                                 styles.msgHighlight,
                           ]}
                        >
                           {speaker}
                           {text}
                        </Text>
                     );
                  }
                  return (
                     <Text
                        key={i}
                        style={[
                           styles.msg,
                           isHighlightedEntry &&
                              i === messageHighlightIndex &&
                              styles.msgHighlight,
                        ]}
                     >
                        {String(m)}
                     </Text>
                  );
               })
            ) : (
               <Text style={styles.msg}>
                  {JSON.stringify(item.conversation)}
               </Text>
            )}
         </View>
      );
   };

   return (
      <View style={styles.container}>
         <View style={styles.header}>
            <TouchableOpacity
               onPress={onBack}
               style={styles.backBtn}
               hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
               <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{name}</Text>
         </View>

         {loading && (
            <ActivityIndicator size='large' style={{ marginTop: 20 }} />
         )}
         {error && <Text style={styles.error}>{error}</Text>}

         {!loading && !error && (
            <FlatList
               ref={listRef}
               data={data}
               keyExtractor={(item, idx) => String(item.timestamp || idx)}
               renderItem={renderEntry}
               contentContainerStyle={{ padding: 16 }}
               onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => {
                     listRef.current?.scrollToIndex({ index, animated: true });
                  }, 200);
               }}
            />
         )}
      </View>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: '#fff' },
   header: {
      position: 'relative',
      marginTop: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      backgroundColor: '#fff',
   },
   backBtn: {
      width: 36,
      height: 28,
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
   },
   backText: {
      fontSize: 16,
      color: '#000',
      fontWeight: '700',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   title: {
      position: 'absolute',
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: '#000',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   entry: {
      marginBottom: 12,
      backgroundColor: '#f7f7f7',
      padding: 12,
      borderRadius: 8,
   },
   entryHighlight: {
      borderWidth: 1,
      borderColor: '#f2c94c',
      backgroundColor: '#fffbe6',
   },
   ts: {
      fontSize: 12,
      color: '#666',
      marginBottom: 6,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   msg: {
      fontSize: 14,
      color: '#222',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
      paddingVertical: 2,
   },
   msgHighlight: {
      backgroundColor: '#ffe9a6',
      borderRadius: 4,
      paddingHorizontal: 4,
   },
   error: { color: '#a00', padding: 16 },
});
