import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
   View,
   Text,
   FlatList,
   TouchableOpacity,
   StyleSheet,
   ActivityIndicator,
   Platform,
   Image,
} from 'react-native';
import axios from 'axios';
import { BASE_URL } from '../config';

export default function ConversationScreen({
   name,
   avatarUrl,
   headline: profileHeadline,
   highlightTimestamp,
   highlightIndex,
   onBack,
}) {
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState(null);
   const [data, setData] = useState([]);
   const [conversationHeadline, setConversationHeadline] = useState('');
   const listRef = useRef(null);

   const displayHeadline = profileHeadline || conversationHeadline;
   const initials = name
      ? name
           .split(' ')
           .filter(Boolean)
           .slice(0, 2)
           .map((part) => part[0]?.toUpperCase())
           .join('')
      : '?';

   useEffect(() => {
      let mounted = true;
      setLoading(true);
      axios
         .get(`${BASE_URL}/api/conversation/${name}`)
         .then((res) => {
            if (!mounted) return;
            // API returns { name, conversation } or 404
            const conversations = res.data.conversation || [];
            setData(conversations);
            // Get headline from the most recent entry
            if (conversations.length > 0) {
               for (let i = conversations.length - 1; i >= 0; i--) {
                  if (conversations[i].headline) {
                     setConversationHeadline(conversations[i].headline);
                     break;
                  }
               }
            }
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
      const highlightSet =
         isHighlightedEntry && Array.isArray(item.highlight_indices)
            ? new Set(item.highlight_indices)
            : isHighlightedEntry && Number.isInteger(highlightIndex)
            ? new Set([highlightIndex])
            : new Set();

      return (
         <View
            style={[styles.entry, isHighlightedEntry && styles.entryHighlight]}
         >
            {ts ? (
               <View style={styles.entryTimestampWrapper}>
                  <View style={styles.entryDivider} />
                  <Text style={styles.ts}>{ts}</Text>
                  <View style={styles.entryDivider} />
               </View>
            ) : null}
            {Array.isArray(item.conversation)
               ? item.conversation.map((m, i) => {
                    const isObject = m && typeof m === 'object';
                    const speaker = isObject && m.speaker ? m.speaker : '';
                    const text = isObject
                       ? m.text != null
                          ? m.text
                          : JSON.stringify(m)
                       : typeof m === 'string'
                       ? m
                       : String(m ?? '');
                    const isSelf = speaker
                       ? /you|me|self/i.test(speaker)
                       : false;

                    return (
                       <View
                          key={i}
                          style={[
                             styles.msgBubble,
                             isSelf
                                ? styles.msgBubbleSelf
                                : styles.msgBubblePeer,
                             isHighlightedEntry &&
                                highlightSet.has(i) &&
                                styles.msgBubbleHighlight,
                          ]}
                       >
                          {speaker ? (
                             <Text
                                style={[
                                   styles.msgSpeaker,
                                   isSelf && styles.msgSpeakerSelf,
                                ]}
                             >
                                {speaker}
                             </Text>
                          ) : null}
                          <Text style={styles.msgText}>{text}</Text>
                       </View>
                    );
                 })
               : (
                    <View
                       style={[
                          styles.msgBubble,
                          styles.msgBubblePeer,
                          isHighlightedEntry && styles.msgBubbleHighlight,
                       ]}
                    >
                       <Text style={styles.msgText}>
                          {JSON.stringify(item.conversation)}
                       </Text>
                    </View>
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
            <View style={styles.profileBubble}>
               {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.profileAvatar} />
               ) : (
                  <View style={styles.profileAvatarFallback}>
                     <Text style={styles.profileAvatarFallbackText}>{initials}</Text>
                  </View>
               )}
               <Text style={styles.profileName}>{name}</Text>
               {displayHeadline ? (
                  <Text style={styles.profileHeadline}>{displayHeadline}</Text>
               ) : null}
            </View>
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
               contentContainerStyle={styles.listContent}
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

const baseMono =
   Platform.OS === 'ios'
      ? 'American Typewriter'
      : Platform.OS === 'android'
      ? 'monospace'
      : 'Courier New';

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: '#fff' },
   header: {
      paddingTop: 24,
      paddingBottom: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
      backgroundColor: '#fff',
   },
   backBtn: {
      width: 42,
      height: 32,
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
   },
   backText: {
      fontSize: 18,
      color: '#000',
      fontWeight: '700',
      fontFamily: baseMono,
   },
   profileBubble: {
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 24,
      paddingVertical: 18,
      paddingHorizontal: 20,
      alignItems: 'center',
      backgroundColor: '#fff',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 360,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
   },
   profileAvatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#000',
   },
   profileAvatarFallback: {
      width: 96,
      height: 96,
      borderRadius: 48,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#000',
      backgroundColor: '#f3f3f3',
      alignItems: 'center',
      justifyContent: 'center',
   },
   profileAvatarFallbackText: {
      fontSize: 26,
      fontWeight: '700',
      color: '#333',
      fontFamily: baseMono,
   },
   profileName: {
      fontSize: 22,
      fontWeight: '700',
      color: '#000',
      textAlign: 'center',
      textTransform: 'uppercase',
      fontFamily: baseMono,
   },
   profileHeadline: {
      fontSize: 14,
      color: '#666',
      marginTop: 4,
      textAlign: 'center',
      fontFamily: baseMono,
   },
   listContent: {
      paddingHorizontal: 16,
      paddingVertical: 20,
      paddingBottom: 36,
   },
   entry: {
      marginBottom: 18,
   },
   entryHighlight: {
      borderLeftWidth: 3,
      borderLeftColor: '#f2c94c',
      paddingLeft: 12,
   },
   entryTimestampWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
   },
   entryDivider: {
      flex: 1,
      height: 1,
      backgroundColor: '#ececec',
   },
   ts: {
      fontSize: 12,
      color: '#888',
      marginHorizontal: 12,
      fontFamily: baseMono,
   },
   msgBubble: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: '#f3f4f6',
      borderWidth: 1,
      borderColor: '#e5e5e5',
      marginBottom: 10,
      maxWidth: '90%',
   },
   msgBubblePeer: {
      alignSelf: 'flex-start',
   },
   msgBubbleSelf: {
      alignSelf: 'flex-end',
      backgroundColor: '#e3f1ff',
      borderColor: '#c5dfff',
   },
   msgBubbleHighlight: {
      borderColor: '#f2c94c',
      backgroundColor: '#fffbe6',
   },
   msgSpeaker: {
      fontSize: 12,
      color: '#666',
      marginBottom: 2,
      fontFamily: baseMono,
   },
   msgSpeakerSelf: {
      color: '#1a73e8',
      textAlign: 'right',
   },
   msgText: {
      fontSize: 15,
      color: '#111',
      fontFamily: baseMono,
      lineHeight: 20,
   },
   error: { color: '#a00', padding: 16 },
});
