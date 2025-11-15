import React, { useEffect, useRef, useState } from 'react';
import {
   View,
   Text,
   Image,
   TouchableOpacity,
   ScrollView,
   StyleSheet,
   Platform,
   TextInput,
   ActivityIndicator,
   Linking,
   Keyboard,
   Modal,
   Animated,
   Easing,
} from 'react-native';
import axios from 'axios';
import { BASE_URL } from '../config';

export default function PeopleScreen({ onOpenConversation }) {
   const [people, setPeople] = useState([]);
   const [assistantInput, setAssistantInput] = useState('');
   const [latestInteraction, setLatestInteraction] = useState(null);
   const [assistantLoading, setAssistantLoading] = useState(false);
   const [assistantError, setAssistantError] = useState('');
   const [assistantModalVisible, setAssistantModalVisible] = useState(false);
   const assistantInputRef = useRef(null);
   const baseComposerOffset = Platform.OS === 'ios' ? 16 : 10;
   const composerOffset = useRef(
      new Animated.Value(baseComposerOffset)
   ).current;

   useEffect(() => {
      axios
         .get(`${BASE_URL}/api/people`)
         .then((res) => {
            console.log('API Response:', res.data);
            setPeople(res.data);
         })
         .catch((err) => console.error('API Error:', err));
   }, []);

   useEffect(() => {
      const showEvent =
         Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent =
         Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

      const animateTo = (value) => {
         Animated.timing(composerOffset, {
            toValue: value,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
         }).start();
      };

      const showSub = Keyboard.addListener(showEvent, (event) => {
         const height = event.endCoordinates?.height || 0;
         animateTo(height + baseComposerOffset);
      });
      const hideSub = Keyboard.addListener(hideEvent, () => {
         animateTo(baseComposerOffset);
      });

      return () => {
         showSub.remove();
         hideSub.remove();
      };
   }, [baseComposerOffset, composerOffset]);

   useEffect(() => {
      let focusTimer;
      if (assistantModalVisible) {
         focusTimer = setTimeout(() => {
            assistantInputRef.current?.focus();
         }, 180);
      }
      if (!assistantModalVisible) {
         Animated.timing(composerOffset, {
            toValue: baseComposerOffset,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
         }).start();
      }
      return () => {
         if (focusTimer) {
            clearTimeout(focusTimer);
         }
      };
   }, [assistantModalVisible, baseComposerOffset, composerOffset]);

   const handleAskAssistant = async () => {
      const question = assistantInput.trim();
      if (!question || assistantLoading) return;

      setAssistantLoading(true);
      setAssistantError('');

      try {
         const res = await axios.post(`${BASE_URL}/api/people/assistant`, {
            question,
         });

         setLatestInteraction({
            id: Date.now().toString(),
            question,
            answer: res.data?.answer,
            match: res.data?.match,
         });
         setAssistantInput('');
      } catch (error) {
         console.error(
            'Assistant error:',
            error?.response?.data || error.message
         );
         const message =
            error?.response?.data?.error ||
            'Something went wrong asking the assistant. Please try again.';
         setAssistantError(message);
      } finally {
         setAssistantLoading(false);
      }
   };

   const handleOpenProfile = (match) => {
      if (!match) return;
      if (match.name && typeof onOpenConversation === 'function') {
         onOpenConversation({
            name: match.name,
            highlightTimestamp: match.timestamp,
            highlightIndex: match.highlight_index,
         });
         return;
      }
      if (match.profile_url) {
         Linking.openURL(match.profile_url).catch(() => {
            console.warn('Could not open profile link.');
         });
      }
   };

   return (
      <View style={styles.screen}>
         <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps='handled'
         >
            <Text style={styles.header}>People You’ve Talked To</Text>
            {people.map((person, index) => (
               <View key={index} style={styles.card}>
                  <Image
                     source={{ uri: person.image_url }}
                     style={styles.image}
                  />
                  <Text style={styles.name}>{person.name || 'Unknown'}</Text>

                  <TouchableOpacity
                     style={styles.sign}
                     onPress={() =>
                        onOpenConversation
                           ? onOpenConversation({ name: person.name })
                           : console.log('Open chat with', person.name)
                     }
                  >
                     <Text style={styles.signText}>➜</Text>
                  </TouchableOpacity>
               </View>
            ))}
         </ScrollView>
         <View style={styles.composerTriggerShell}>
            <TouchableOpacity
               style={styles.composerTrigger}
               activeOpacity={0.9}
               onPress={() => setAssistantModalVisible(true)}
            >
               <Text style={styles.composerTriggerText}>
                  {latestInteraction?.question
                     ? `You: ${latestInteraction.question}`
                     : 'Ask everyone anything...'}
               </Text>
            </TouchableOpacity>
         </View>

         <Modal
            visible={assistantModalVisible}
            transparent
            animationType='fade'
            onRequestClose={() => setAssistantModalVisible(false)}
         >
            <View style={styles.modalOverlay}>
               <TouchableOpacity
                  style={styles.modalBackdrop}
                  activeOpacity={1}
                  onPress={() => setAssistantModalVisible(false)}
               />
               <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                     <Text style={styles.modalTitle}>Ask Everyone</Text>
                     <TouchableOpacity
                        onPress={() => setAssistantModalVisible(false)}
                        style={styles.modalClose}
                     >
                        <Text style={styles.modalCloseText}>✕</Text>
                     </TouchableOpacity>
                  </View>
                  {assistantError ? (
                     <Text style={[styles.assistantError, styles.modalError]}>
                        {assistantError}
                     </Text>
                  ) : null}
                  <ScrollView
                     style={styles.modalContent}
                     contentContainerStyle={{ paddingBottom: 160 }}
                     keyboardShouldPersistTaps='handled'
                  >
                     {latestInteraction ? (
                        <View
                           key={latestInteraction.id}
                           style={styles.assistantResponse}
                        >
                           <Text style={styles.assistantLabel}>You</Text>
                           <Text style={styles.assistantQuestion}>
                              {latestInteraction.question}
                           </Text>
                           <Text style={styles.assistantLabel}>Assistant</Text>
                           {latestInteraction.match?.excerpt?.length ? (
                              <View style={styles.assistantExcerpt}>
                                 {latestInteraction.match.excerpt.map(
                                    (turn, idx) => (
                                       <Text
                                          key={`${latestInteraction.id}-modal-${idx}`}
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
                           ) : (
                              <Text style={styles.assistantAnswer}>
                                 {latestInteraction.answer}
                              </Text>
                           )}
                           {latestInteraction.match?.name ? (
                              <TouchableOpacity
                                 style={styles.assistantLink}
                                 onPress={() => {
                                    setAssistantModalVisible(false);
                                    handleOpenProfile(latestInteraction.match);
                                 }}
                              >
                                 <Text style={styles.assistantLinkText}>
                                    View {latestInteraction.match.name}’s
                                    profile
                                 </Text>
                              </TouchableOpacity>
                           ) : null}
                        </View>
                     ) : (
                        <Text style={styles.assistantPlaceholder}>
                           Ask your first question to see the latest answer
                           here.
                        </Text>
                     )}
                  </ScrollView>
                  <Animated.View
                     style={[
                        styles.modalComposerShell,
                        { bottom: composerOffset },
                     ]}
                  >
                     <View style={styles.modalComposer}>
                        <TextInput
                           value={assistantInput}
                           onChangeText={setAssistantInput}
                           ref={assistantInputRef}
                           style={styles.modalInput}
                           placeholder='Type your question'
                           placeholderTextColor='#999'
                           returnKeyType='send'
                           onSubmitEditing={handleAskAssistant}
                        />
                        <TouchableOpacity
                           style={[
                              styles.assistantButton,
                              assistantLoading &&
                                 styles.assistantButtonDisabled,
                           ]}
                           onPress={handleAskAssistant}
                           disabled={assistantLoading}
                        >
                           {assistantLoading ? (
                              <ActivityIndicator color='#000' size='small' />
                           ) : (
                              <Text style={styles.assistantButtonText}>
                                 Send
                              </Text>
                           )}
                        </TouchableOpacity>
                     </View>
                  </Animated.View>
               </View>
            </View>
         </Modal>
      </View>
   );
}

const styles = StyleSheet.create({
   screen: { flex: 1, backgroundColor: '#fff' },
   container: {
      padding: 16,
      marginTop: 36,
      paddingBottom: 140,
      backgroundColor: '#fff',
   },
   assistantButton: {
      minWidth: 64,
      height: 40,
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
      marginLeft: 12,
   },
   assistantButtonDisabled: {
      opacity: 0.6,
   },
   assistantButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#000',
   },
   assistantPlaceholder: {
      fontSize: 14,
      color: '#666',
      marginBottom: 12,
   },
   assistantError: {
      color: '#c00',
      fontSize: 14,
      marginBottom: 8,
   },
   assistantResponse: {
      borderTopWidth: 1,
      borderTopColor: '#eee',
      paddingTop: 12,
      marginTop: 12,
   },
   assistantLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: '#444',
   },
   assistantQuestion: {
      fontSize: 16,
      color: '#000',
      marginBottom: 6,
   },
   assistantAnswer: {
      fontSize: 16,
      fontStyle: 'italic',
      color: '#222',
      marginBottom: 6,
   },
   assistantExcerpt: {
      marginBottom: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: '#e5e5e5',
      borderRadius: 6,
      backgroundColor: '#fafafa',
   },
   assistantExcerptLine: {
      fontSize: 15,
      color: '#111',
      marginBottom: 4,
   },
   assistantExcerptHighlight: {
      backgroundColor: '#fff6cc',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
   },
   assistantExcerptSpeaker: {
      fontWeight: '700',
      color: '#000',
   },
   assistantLink: {
      alignSelf: 'flex-start',
      paddingVertical: 6,
   },
   assistantLinkText: {
      color: '#0072ff',
      fontSize: 15,
      fontWeight: '600',
   },
   composerTriggerShell: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 30 : 20,
   },
   composerTrigger: {
      borderWidth: 1,
      borderColor: '#d9d9d9',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor:
         Platform.OS === 'ios'
            ? 'rgba(255,255,255,0.9)'
            : 'rgba(255,255,255,0.98)',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
   },
   composerTriggerText: {
      fontSize: 16,
      color: '#333',
   },
   modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
   },
   modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
   },
   modalCard: {
      flex: 1,
      marginTop: 80,
      backgroundColor:
         Platform.OS === 'ios'
            ? 'rgba(255,255,255,0.9)'
            : 'rgba(255,255,255,0.97)',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
   },
   modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
   },
   modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#000',
   },
   modalClose: {
      position: 'absolute',
      right: 16,
      top: 12,
      padding: 8,
   },
   modalCloseText: {
      fontSize: 18,
      color: '#000',
      fontWeight: '700',
   },
   modalError: {
      paddingHorizontal: 16,
   },
   modalContent: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 12,
   },
   modalComposerShell: {
      position: 'absolute',
      left: 0,
      right: 0,
   },
   modalComposer: {
      marginHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#d9d9d9',
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor:
         Platform.OS === 'ios'
            ? 'rgba(255,255,255,0.92)'
            : 'rgba(255,255,255,0.97)',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
   },
   modalInput: {
      flex: 1,
      fontSize: 16,
      color: '#000',
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      paddingRight: 8,
   },
   header: {
      fontSize: 24,
      fontWeight: '700',
      marginVertical: 12,
      color: '#000',
      textAlign: 'center',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   card: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      padding: 12,
      backgroundColor: '#fff',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#000',
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
   },
   image: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 1,
      borderColor: '#000',
   },
   name: {
      fontSize: 18,
      fontWeight: '700',
      color: '#000',
      marginLeft: 12,
      flex: 1,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
      textTransform: 'uppercase',
   },
   sign: {
      marginLeft: 12,
      width: 36,
      height: 28,
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
   },
   signText: {
      fontSize: 18,
      fontWeight: '700',
      color: '#000',
   },
});
