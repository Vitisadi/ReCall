import React, {
   useCallback,
   useEffect,
   useMemo,
   useRef,
   useState,
} from 'react';
import {
   View,
   Text,
   FlatList,
   TouchableOpacity,
   StyleSheet,
   ActivityIndicator,
   Platform,
   Image,
   Linking,
   TextInput,
   KeyboardAvoidingView,
   Modal,
   ScrollView,
   Keyboard,
} from 'react-native';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { BASE_URL } from '../config';
import { retroFonts, retroPalette, retroMenuItems } from '../styles/retroTheme';

export default function RetroConversationScreen({
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
   const [linkedinUrl, setLinkedinUrl] = useState('');
   const [personAssistantInput, setPersonAssistantInput] = useState('');
   const [personAssistantLoading, setPersonAssistantLoading] = useState(false);
   const [personAssistantError, setPersonAssistantError] = useState('');
   const [personAssistantResult, setPersonAssistantResult] = useState(null);
   const [personAssistantModalVisible, setPersonAssistantModalVisible] =
      useState(false);
   const [isModalComposerActive, setIsModalComposerActive] = useState(false);
   const [activeHighlight, setActiveHighlight] = useState({
      timestamp: highlightTimestamp || null,
      index: Number.isInteger(highlightIndex) ? highlightIndex : -1,
      indices: [],
   });
   const listRef = useRef(null);
   const assistantInputRef = useRef(null);

   useEffect(() => {
      setActiveHighlight({
         timestamp: highlightTimestamp || null,
         index: Number.isInteger(highlightIndex) ? highlightIndex : -1,
         indices: [],
      });
   }, [highlightTimestamp, highlightIndex]);

   useEffect(() => {
      if (!personAssistantModalVisible || !isModalComposerActive) return;
      const timer = setTimeout(() => {
         assistantInputRef.current?.focus();
      }, 220);
      return () => clearTimeout(timer);
   }, [personAssistantModalVisible, isModalComposerActive]);

   const displayHeadline = profileHeadline || conversationHeadline;
   const displayPersonName = useMemo(() => {
      if (!name) return '';
      return name
         .split(' ')
         .filter(Boolean)
         .map((part) => part[0].toUpperCase() + part.slice(1))
         .join(' ');
   }, [name]);
   const assistantDisplayName = displayPersonName || name;
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
            // Get headline and LinkedIn URL from the most recent entry
            if (conversations.length > 0) {
               for (let i = conversations.length - 1; i >= 0; i--) {
                  if (conversations[i].headline) {
                     setConversationHeadline(conversations[i].headline);
                  }
                  const linked =
                     conversations[i].linkedin || conversations[i].linkedin_url;
                  if (linked) {
                     setLinkedinUrl(linked);
                  }
                  if (conversations[i].headline || linked) {
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
      if (!activeHighlight.timestamp || !data.length || !listRef.current)
         return;
      const entryIndex = data.findIndex(
         (entry) => entry.timestamp === activeHighlight.timestamp
      );
      if (entryIndex < 0) return;

      requestAnimationFrame(() => {
         listRef.current?.scrollToIndex({
            index: entryIndex,
            animated: true,
         });
      });
   }, [data, activeHighlight.timestamp]);

   useEffect(() => {
      scrollToHighlight();
   }, [scrollToHighlight]);

   useEffect(() => {
      if (activeHighlight.timestamp || !data.length || !listRef.current) {
         return;
      }
      ensureScrolledToEnd();
   }, [data, activeHighlight.timestamp, ensureScrolledToEnd]);

   const applyMatchHighlight = useCallback((match) => {
      if (!match || !match.timestamp) return;
      setActiveHighlight({
         timestamp: match.timestamp,
         index: Number.isInteger(match.highlight_index)
            ? match.highlight_index
            : -1,
         indices: Array.isArray(match.highlight_indices)
            ? match.highlight_indices
            : [],
      });
   }, []);

   const ensureScrolledToEnd = useCallback(() => {
      if (activeHighlight.timestamp || !listRef.current) return;
      requestAnimationFrame(() => {
         listRef.current?.scrollToEnd?.({ animated: false });
      });
   }, [activeHighlight.timestamp]);

   const closeAssistantModal = useCallback(() => {
      setPersonAssistantModalVisible(false);
      setIsModalComposerActive(false);
      Keyboard.dismiss();
   }, []);

   const openAssistantModal = useCallback(() => {
      setPersonAssistantError('');
      setPersonAssistantInput('');
      setIsModalComposerActive(!personAssistantResult);
      setPersonAssistantModalVisible(true);
   }, [personAssistantResult]);

   const renderEntry = ({ item }) => {
      // item is expected to be { timestamp, conversation }
      const ts = item.timestamp
         ? new Date(item.timestamp * 1000).toLocaleString()
         : '';
      const isHighlightedEntry =
         Boolean(activeHighlight.timestamp) &&
         item.timestamp === activeHighlight.timestamp;
      const highlightSet = (() => {
         if (!isHighlightedEntry) {
            return new Set();
         }
         if (
            Array.isArray(item.highlight_indices) &&
            item.highlight_indices.length
         ) {
            return new Set(item.highlight_indices);
         }
         if (
            Array.isArray(activeHighlight.indices) &&
            activeHighlight.indices.length
         ) {
            return new Set(activeHighlight.indices);
         }
         if (Number.isInteger(activeHighlight.index)) {
            return new Set([activeHighlight.index]);
         }
         return new Set();
      })();

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
            {Array.isArray(item.conversation) ? (
               item.conversation.map((m, i) => {
                  const isObject = m && typeof m === 'object';
                  const speaker = isObject && m.speaker ? m.speaker : '';
                  const text = isObject
                     ? m.text != null
                        ? m.text
                        : JSON.stringify(m)
                     : typeof m === 'string'
                     ? m
                     : String(m ?? '');
                  const isSelf = speaker ? /you|me|self/i.test(speaker) : false;

                  return (
                     <View
                        key={i}
                        style={[
                           styles.msgBubble,
                           isSelf ? styles.msgBubbleSelf : styles.msgBubblePeer,
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
            ) : (
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

   const handleAskPerson = async () => {
      const question = personAssistantInput.trim();
      if (!question || personAssistantLoading) return;

      setPersonAssistantLoading(true);
      setPersonAssistantError('');
      setIsModalComposerActive(false);
      Keyboard.dismiss();
      try {
         const res = await axios.post(`${BASE_URL}/api/people/assistant`, {
            question,
            name,
            person: name,
            person_key: (name || '').trim().toLowerCase(),
         });
         const payload = res.data || {};
         const normalizedTarget = (name || '').trim().toLowerCase();
         const normalizedMatch = (payload.match?.name || '')
            .toString()
            .trim()
            .toLowerCase();
         if (
            normalizedTarget &&
            normalizedMatch &&
            normalizedTarget !== normalizedMatch
         ) {
            setPersonAssistantResult(null);
            setPersonAssistantError(
               `This memory only contains info about ${assistantDisplayName}.`
            );
            return;
         }
         setPersonAssistantResult({
            id: Date.now().toString(),
            question: payload.question || question,
            answer: payload.answer,
            suggestion: payload.suggestion,
            match: payload.match,
         });
         setPersonAssistantInput('');
         if (payload.match) {
            applyMatchHighlight(payload.match);
         }
      } catch (error) {
         console.error(
            'Person assistant error:',
            error?.response?.data || error.message
         );
         const message =
            error?.response?.data?.error ||
            `Something went wrong asking about ${name}. Please try again.`;
         setPersonAssistantError(message);
      } finally {
         setPersonAssistantLoading(false);
      }
   };

   return (
      <>
         <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
         >
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
                  <View style={styles.windowBody}>
                     <View style={styles.header}>
                        <TouchableOpacity
                           onPress={onBack}
                           style={styles.backBtn}
                           hitSlop={{
                              top: 12,
                              bottom: 12,
                              left: 12,
                              right: 12,
                           }}
                        >
                           <Text style={styles.backText}>←</Text>
                        </TouchableOpacity>
                        <View style={styles.profileBubble}>
                           {avatarUrl ? (
                              <Image
                                 source={{ uri: avatarUrl }}
                                 style={styles.profileAvatar}
                              />
                           ) : (
                              <View style={styles.profileAvatarFallback}>
                                 <Text style={styles.profileAvatarFallbackText}>
                                    {initials}
                                 </Text>
                              </View>
                           )}
                           <Text style={styles.profileName}>{name}</Text>
                           {displayHeadline ? (
                              <Text style={styles.profileHeadline}>
                                 {displayHeadline}
                              </Text>
                           ) : null}
                        </View>
                     </View>

                     {loading && (
                        <ActivityIndicator
                           size='large'
                           color={retroPalette.violet}
                           style={{ marginTop: 20 }}
                        />
                     )}
                     {error && <Text style={styles.error}>{error}</Text>}

                     {!loading && !error && (
                        <>
                           <FlatList
                              ref={listRef}
                              data={data}
                              keyExtractor={(item, idx) =>
                                 String(item.timestamp || idx)
                              }
                              renderItem={renderEntry}
                              style={styles.list}
                              contentContainerStyle={styles.listContent}
                              keyboardShouldPersistTaps='handled'
                              onContentSizeChange={ensureScrolledToEnd}
                              onScrollToIndexFailed={({ index }) => {
                                 setTimeout(() => {
                                    listRef.current?.scrollToIndex({
                                       index,
                                       animated: true,
                                    });
                                 }, 200);
                              }}
                           />
                           <View style={styles.assistantTriggerShell}>
                              <TouchableOpacity
                                 style={styles.assistantTrigger}
                                 activeOpacity={0.9}
                                 onPress={openAssistantModal}
                              >
                                 <Text style={styles.assistantTriggerText}>
                                    {personAssistantResult?.question
                                       ? `You: ${personAssistantResult.question}`
                                       : `Ask about ${assistantDisplayName}`}
                                 </Text>
                              </TouchableOpacity>
                           </View>
                        </>
                     )}
                     <Text style={styles.profileName}>{name}</Text>
                     {displayHeadline ? (
                        <Text style={styles.profileHeadline}>
                           {displayHeadline}
                        </Text>
                     ) : null}
                     {linkedinUrl ? (
                        <TouchableOpacity
                           onPress={() => Linking.openURL(linkedinUrl)}
                           style={styles.linkedinLinkWrapper}
                        >
                           <Text style={styles.linkedinLink}>
                              View LinkedIn Profile
                           </Text>
                        </TouchableOpacity>
                     ) : null}
                     {linkedinUrl ? (
                        <TouchableOpacity
                           onPress={() => Linking.openURL(linkedinUrl)}
                           style={styles.linkedinRow}
                           activeOpacity={0.8}
                        >
                           <View style={styles.linkedinIcon}>
                              <Text style={styles.linkedinIconText}>in</Text>
                           </View>
                           <Text style={styles.linkedinUrl} numberOfLines={1}>
                              {linkedinUrl}
                           </Text>
                        </TouchableOpacity>
                     ) : null}
                  </View>
               </View>
            </LinearGradient>
         </KeyboardAvoidingView>

         <Modal
            visible={personAssistantModalVisible}
            transparent
            animationType='fade'
            onRequestClose={closeAssistantModal}
         >
            <View style={styles.modalOverlay}>
               <TouchableOpacity
                  style={styles.modalBackdrop}
                  activeOpacity={1}
                  onPress={closeAssistantModal}
               />
               <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  style={styles.modalCardWrapper}
               >
                  <View style={styles.modalCard}>
                     <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>
                           Ask About {assistantDisplayName}
                        </Text>
                        <TouchableOpacity
                           onPress={closeAssistantModal}
                           style={styles.modalClose}
                        >
                           <Text style={styles.modalCloseText}>✕</Text>
                        </TouchableOpacity>
                     </View>
                     {personAssistantError ? (
                        <Text
                           style={[
                              styles.assistantErrorMessage,
                              styles.modalError,
                           ]}
                        >
                           {personAssistantError}
                        </Text>
                     ) : null}
                     <ScrollView
                        style={styles.modalContent}
                        contentContainerStyle={{ paddingBottom: 160 }}
                        keyboardShouldPersistTaps='handled'
                     >
                        {personAssistantResult ? (
                           <View style={styles.assistantBlock}>
                              <Text style={styles.assistantLabel}>You</Text>
                              <Text style={styles.assistantQuestion}>
                                 {personAssistantResult.question}
                              </Text>
                              <Text style={styles.assistantLabel}>
                                 Assistant
                              </Text>
                              {personAssistantResult.answer ? (
                                 <Text style={styles.assistantAnswer}>
                                    {personAssistantResult.answer}
                                 </Text>
                              ) : null}
                              {personAssistantResult.suggestion ? (
                                 <Text style={styles.assistantSuggestion}>
                                    {personAssistantResult.suggestion}
                                 </Text>
                              ) : null}
                              {Array.isArray(
                                 personAssistantResult.match?.excerpt
                              ) &&
                              personAssistantResult.match.excerpt.length > 0 ? (
                                 <View style={styles.assistantExcerpt}>
                                    {personAssistantResult.match.excerpt.map(
                                       (turn, idx) => (
                                          <Text
                                             key={`${personAssistantResult.id}-excerpt-${idx}`}
                                             style={[
                                                styles.assistantExcerptLine,
                                                turn.is_highlight &&
                                                   styles.assistantExcerptHighlight,
                                             ]}
                                          >
                                             <Text
                                                style={
                                                   styles.assistantExcerptSpeaker
                                                }
                                             >
                                                {turn.speaker}:{' '}
                                             </Text>
                                             {turn.text}
                                          </Text>
                                       )
                                    )}
                                 </View>
                              ) : null}
                              {personAssistantResult.match?.timestamp ? (
                                 <TouchableOpacity
                                    onPress={() => {
                                       applyMatchHighlight(
                                          personAssistantResult.match
                                       );
                                       closeAssistantModal();
                                    }}
                                    style={styles.assistantLink}
                                 >
                                    <Text style={styles.assistantLinkText}>
                                       Jump to highlighted spot
                                    </Text>
                                 </TouchableOpacity>
                              ) : null}
                           </View>
                        ) : (
                           <Text style={styles.assistantPlaceholder}>
                              Ask a question about {assistantDisplayName} to see
                              AI answers here.
                           </Text>
                        )}
                     </ScrollView>
                     <View style={styles.modalComposerShell}>
                        {isModalComposerActive ? (
                           <View style={styles.modalComposer}>
                              <TextInput
                                 ref={assistantInputRef}
                                 value={personAssistantInput}
                                 onChangeText={setPersonAssistantInput}
                                 style={styles.modalInput}
                                 placeholder={`Ask something about ${assistantDisplayName}`}
                                 placeholderTextColor='#999'
                                 returnKeyType='send'
                                 multiline
                                 onSubmitEditing={handleAskPerson}
                              />
                              <TouchableOpacity
                                 style={[
                                    styles.modalSendButton,
                                    personAssistantLoading &&
                                       styles.assistantButtonDisabled,
                                 ]}
                                 onPress={handleAskPerson}
                                 disabled={personAssistantLoading}
                              >
                                 {personAssistantLoading ? (
                                    <ActivityIndicator
                                       size='small'
                                       color='#000'
                                    />
                                 ) : (
                                    <Text style={styles.modalSendText}>
                                       Send
                                    </Text>
                                 )}
                              </TouchableOpacity>
                           </View>
                        ) : (
                           <TouchableOpacity
                              style={styles.modalAskAgainButton}
                              onPress={() => setIsModalComposerActive(true)}
                           >
                              <Text style={styles.modalAskAgainText}>
                                 Ask another question
                              </Text>
                           </TouchableOpacity>
                        )}
                     </View>
                  </View>
               </KeyboardAvoidingView>
            </View>
         </Modal>
      </>
   );
}

const baseMono = retroFonts.base;

const styles = StyleSheet.create({
   gradient: { flex: 1 },
   window: {
      flex: 1,
      margin: 12,
      borderRadius: 24,
      marginTop: 36,
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
      fontFamily: retroFonts.heading,
      textTransform: 'uppercase',
      letterSpacing: 1,
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
   header: {
      paddingBottom: 12,
   },
   backBtn: {
      width: 36,
      height: 28,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      backgroundColor: retroPalette.lilac,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
   },
   backText: {
      fontSize: 18,
      color: retroPalette.warmSand,
      fontWeight: '700',
      fontFamily: baseMono,
   },
   profileBubble: {
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 24,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      backgroundColor: '#fef3e2',
      alignSelf: 'center',
      width: '100%',
      maxWidth: 340,
      shadowColor: '#2c0d38',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
   },
   profileAvatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   profileAvatarFallback: {
      width: 88,
      height: 88,
      borderRadius: 44,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      backgroundColor: retroPalette.lilac,
      alignItems: 'center',
      justifyContent: 'center',
   },
   profileAvatarFallbackText: {
      fontSize: 26,
      fontWeight: '700',
      color: retroPalette.warmSand,
      fontFamily: baseMono,
   },
   profileName: {
      fontSize: 20,
      fontWeight: '700',
      color: retroPalette.outline,
      textAlign: 'center',
      textTransform: 'uppercase',
      fontFamily: retroFonts.heading,
   },
   profileHeadline: {
      fontSize: 14,
      color: retroPalette.violet,
      marginTop: 4,
      textAlign: 'center',
      fontFamily: baseMono,
   },
   linkedinRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      paddingHorizontal: 8,
   },
   linkedinIcon: {
      width: 22,
      height: 22,
      borderRadius: 4,
      backgroundColor: '#0A66C2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
   },
   linkedinIconText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 12,
      fontFamily: baseMono,
   },
   linkedinUrl: {
      fontSize: 13,
      color: retroPalette.teal,
      textDecorationLine: 'underline',
      fontFamily: baseMono,
      maxWidth: '85%',
   },
   list: {
      paddingBottom: Platform.OS === 'ios' ? 260 : 240,
   },
   listContent: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      paddingBottom: 56,
   },
   entry: {
      marginBottom: 14,
   },
   entryHighlight: {
      borderLeftWidth: 3,
      borderLeftColor: retroPalette.coral,
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
      backgroundColor: '#f4c9c9',
   },
   ts: {
      fontSize: 12,
      color: retroPalette.plum,
      marginHorizontal: 12,
      fontFamily: baseMono,
   },
   msgBubble: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: '#fff5dd',
      borderWidth: 2,
      borderColor: retroPalette.outline,
      marginBottom: 10,
      maxWidth: '90%',
   },
   msgBubblePeer: {
      alignSelf: 'flex-start',
   },
   msgBubbleSelf: {
      alignSelf: 'flex-end',
      backgroundColor: '#f8def5',
      borderColor: retroPalette.violet,
   },
   msgBubbleHighlight: {
      borderColor: retroPalette.yellow,
      backgroundColor: '#fffad3',
   },
   msgSpeaker: {
      fontSize: 12,
      color: retroPalette.plum,
      marginBottom: 2,
      fontFamily: baseMono,
   },
   msgSpeakerSelf: {
      color: retroPalette.violet,
      textAlign: 'right',
   },
   msgText: {
      fontSize: 15,
      color: retroPalette.plum,
      fontFamily: baseMono,
      lineHeight: 20,
   },
   error: { color: retroPalette.coral, padding: 16, fontFamily: baseMono },
   assistantErrorMessage: {
      color: retroPalette.coral,
      marginBottom: 8,
      fontSize: 14,
      fontFamily: baseMono,
   },
   assistantBlock: {
      marginBottom: 16,
      borderWidth: 2,
      borderColor: retroPalette.violet,
      borderRadius: 16,
      padding: 12,
      backgroundColor: '#fbe9ff',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
   },
   assistantLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: retroPalette.plum,
      marginBottom: 2,
      fontFamily: baseMono,
   },
   assistantQuestion: {
      fontSize: 15,
      color: retroPalette.plum,
      marginBottom: 8,
      fontFamily: baseMono,
   },
   assistantAnswer: {
      fontSize: 15,
      color: retroPalette.violet,
      fontStyle: 'italic',
      marginBottom: 6,
      fontFamily: baseMono,
   },
   assistantSuggestion: {
      fontSize: 14,
      color: retroPalette.plum,
      marginBottom: 8,
      fontFamily: baseMono,
   },
   assistantExcerpt: {
      borderRadius: 10,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      padding: 8,
      backgroundColor: '#fffbe2',
      marginBottom: 8,
   },
   assistantExcerptLine: {
      fontSize: 14,
      color: retroPalette.plum,
      marginBottom: 4,
      fontFamily: baseMono,
   },
   assistantExcerptHighlight: {
      backgroundColor: '#ffeaa0',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
   },
   assistantExcerptSpeaker: {
      fontWeight: '700',
      color: retroPalette.violet,
      fontFamily: baseMono,
   },
   assistantPlaceholder: {
      fontSize: 14,
      color: retroPalette.plum,
      marginTop: 20,
      fontFamily: baseMono,
   },
   assistantTriggerShell: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 32 : 20,
   },
   assistantTrigger: {
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: '#f9d9ff',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
   },
   assistantTriggerText: {
      fontSize: 16,
      color: retroPalette.plum,
      fontFamily: baseMono,
   },
   modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
   },
   modalBackdrop: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
   },
   modalCardWrapper: {
      flex: 1,
      justifyContent: 'flex-end',
   },
   modalCard: {
      marginTop: 80,
      backgroundColor: retroPalette.warmSand,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      paddingBottom: Platform.OS === 'ios' ? 30 : 20,
      overflow: 'hidden',
   },
   modalHeader: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: retroPalette.menuGray,
      borderBottomWidth: 2,
      borderBottomColor: retroPalette.outline,
   },
   modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: retroPalette.menuText,
      fontFamily: baseMono,
   },
   modalClose: {
      padding: 8,
   },
   modalCloseText: {
      fontSize: 18,
      color: retroPalette.menuText,
      fontWeight: '700',
   },
   modalError: {
      paddingHorizontal: 20,
   },
   modalContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
   },
   modalComposerShell: {
      paddingHorizontal: 16,
      paddingTop: 8,
   },
   modalComposer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: '#fff0f5',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
   },
   modalInput: {
      flex: 1,
      fontSize: 16,
      color: retroPalette.plum,
      fontFamily: baseMono,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      paddingRight: 8,
      minHeight: 60,
   },
   modalSendButton: {
      minWidth: 56,
      height: 40,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: retroPalette.violet,
   },
   modalSendText: {
      fontSize: 15,
      fontWeight: '700',
      color: retroPalette.warmSand,
      fontFamily: baseMono,
   },
   modalAskAgainButton: {
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignSelf: 'center',
      backgroundColor: '#ffe6f0',
   },
   modalAskAgainText: {
      fontSize: 15,
      fontWeight: '600',
      color: retroPalette.plum,
      fontFamily: baseMono,
   },
   assistantButtonDisabled: {
      opacity: 0.6,
   },
   assistantLink: {
      alignSelf: 'flex-start',
      paddingVertical: 4,
   },
   assistantLinkText: {
      color: retroPalette.teal,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: baseMono,
   },
});
