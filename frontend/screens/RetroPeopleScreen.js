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
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { BASE_URL } from '../config';
import { retroFonts, retroPalette, retroMenuItems } from '../styles/retroTheme';

export default function RetroPeopleScreen({ onOpenConversation }) {
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
            suggestion: res.data?.suggestion,
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
            avatarUrl: match.image_url || match.photo_url,
            headline: match.headline,
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
                        <View style={styles.nameContainer}>
                           <Text style={styles.name}>
                              {person.name || 'Unknown'}
                           </Text>
                           {person.headline ? (
                              <Text style={styles.headline}>
                                 {person.headline}
                              </Text>
                           ) : null}
                        </View>
                        <TouchableOpacity
                           style={styles.sign}
                           onPress={() =>
                              onOpenConversation
                                 ? onOpenConversation({
                                      name: person.name,
                                      avatarUrl: person.image_url,
                                      headline: person.headline,
                                   })
                                 : console.log('Open chat with', person.name)
                           }
                        >
                           <Text style={styles.signText}>➜</Text>
                        </TouchableOpacity>
                     </View>
                  ))}
               </ScrollView>
            </View>
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
                           {(() => {
                              const hasExcerpt =
                                 Array.isArray(
                                    latestInteraction.match?.excerpt
                                 ) &&
                                 latestInteraction.match.excerpt.length > 0;
                              const canOpenProfile =
                                 hasExcerpt &&
                                 latestInteraction.match?.name &&
                                 typeof latestInteraction.match?.timestamp ===
                                    'number';
                              return (
                                 <>
                                    <Text style={styles.assistantLabel}>
                                       You
                                    </Text>
                                    <Text style={styles.assistantQuestion}>
                                       {latestInteraction.question}
                                    </Text>
                                    <Text style={styles.assistantLabel}>
                                       Assistant
                                    </Text>
                                    {latestInteraction.answer ? (
                                       <Text style={styles.assistantAnswer}>
                                          {latestInteraction.answer}
                                       </Text>
                                    ) : null}
                                    {latestInteraction.suggestion ? (
                                       <Text style={styles.assistantSuggestion}>
                                          {latestInteraction.suggestion}
                                       </Text>
                                    ) : null}
                                    {hasExcerpt ? (
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
                                    ) : null}
                                    {canOpenProfile ? (
                                       <TouchableOpacity
                                          style={styles.assistantLink}
                                          onPress={() => {
                                             setAssistantModalVisible(false);
                                             handleOpenProfile(
                                                latestInteraction.match
                                             );
                                          }}
                                       >
                                          <View
                                             style={styles.assistantLinkContent}
                                          >
                                             {latestInteraction.match
                                                ?.image_url ? (
                                                <Image
                                                   source={{
                                                      uri: latestInteraction
                                                         .match?.image_url,
                                                   }}
                                                   style={
                                                      styles.assistantLinkImage
                                                   }
                                                />
                                             ) : null}
                                             <Text
                                                style={styles.assistantLinkText}
                                             >
                                                View{' '}
                                                {latestInteraction.match.name}’s
                                                profile
                                             </Text>
                                          </View>
                                       </TouchableOpacity>
                                    ) : null}
                                 </>
                              );
                           })()}
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
                              <ActivityIndicator
                                 color={retroPalette.warmSand}
                                 size='small'
                              />
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
      </LinearGradient>
   );
}

const styles = StyleSheet.create({
   gradient: { flex: 1 },
   window: {
      flex: 1,
      margin: 12,
      borderRadius: 24,
      marginTop: 46,
      borderWidth: 3,
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
      paddingBottom: 120,
   },
   container: {
      padding: 16,
      paddingBottom: 160,
   },
   assistantButton: {
      minWidth: 64,
      height: 40,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: retroPalette.violet,
      marginLeft: 12,
   },
   assistantButtonDisabled: {
      opacity: 0.6,
   },
   assistantButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: retroPalette.warmSand,
      fontFamily: retroFonts.base,
   },
   assistantPlaceholder: {
      fontSize: 14,
      color: retroPalette.plum,
      marginBottom: 12,
      fontFamily: retroFonts.base,
   },
   assistantError: {
      color: retroPalette.coral,
      fontSize: 14,
      marginBottom: 8,
      fontFamily: retroFonts.base,
   },
   assistantResponse: {
      borderTopWidth: 2,
      borderTopColor: retroPalette.outline,
      paddingTop: 12,
      marginTop: 12,
   },
   assistantLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: retroPalette.plum,
      fontFamily: retroFonts.base,
   },
   assistantQuestion: {
      fontSize: 16,
      color: retroPalette.plum,
      marginBottom: 6,
      fontFamily: retroFonts.base,
   },
   assistantAnswer: {
      fontSize: 16,
      fontStyle: 'italic',
      color: retroPalette.violet,
      marginBottom: 6,
      fontFamily: retroFonts.base,
   },
   assistantSuggestion: {
      fontSize: 14,
      color: retroPalette.plum,
      marginBottom: 8,
      fontFamily: retroFonts.base,
   },
   assistantExcerpt: {
      marginBottom: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 8,
      backgroundColor: '#fff7e2',
   },
   assistantExcerptLine: {
      fontSize: 15,
      color: retroPalette.plum,
      marginBottom: 4,
      fontFamily: retroFonts.base,
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
      fontFamily: retroFonts.base,
   },
   assistantLink: {
      alignSelf: 'flex-start',
      paddingVertical: 6,
   },
   assistantLinkContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
   },
   assistantLinkImage: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   assistantLinkText: {
      color: retroPalette.teal,
      fontSize: 15,
      fontWeight: '600',
      fontFamily: retroFonts.heading,
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
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: '#f5d0ff',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
   },
   composerTriggerText: {
      fontSize: 16,
      color: retroPalette.plum,
      fontFamily: retroFonts.base,
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
      backgroundColor: retroPalette.warmSand,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
   },
   modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 2,
      borderBottomColor: retroPalette.outline,
      backgroundColor: retroPalette.menuGray,
   },
   modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: retroPalette.menuText,
      fontFamily: retroFonts.heading,
   },
   modalClose: {
      position: 'absolute',
      right: 16,
      top: 12,
      padding: 8,
   },
   modalCloseText: {
      fontSize: 18,
      color: retroPalette.menuText,
      fontWeight: '700',
   },
   modalError: {
      paddingHorizontal: 16,
      color: retroPalette.coral,
      fontFamily: retroFonts.base,
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
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: '#fce9ff',
      shadowColor: '#2c0d38',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
   },
   modalInput: {
      flex: 1,
      fontSize: 16,
      color: retroPalette.plum,
      fontFamily: retroFonts.base,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      paddingRight: 8,
   },
   header: {
      fontSize: 26,
      fontWeight: '700',
      marginVertical: 16,
      color: retroPalette.outline,
      textAlign: 'center',
      fontFamily: retroFonts.heading,
      textTransform: 'uppercase',
   },
   card: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      padding: 12,
      backgroundColor: '#fff5dd',
      borderRadius: 18,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      shadowColor: '#2c0d38',
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 4,
   },
   image: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
      borderColor: retroPalette.outline,
   },
   nameContainer: {
      flex: 1,
      marginLeft: 12,
      justifyContent: 'center',
   },
   name: {
      fontSize: 18,
      fontWeight: '700',
      color: retroPalette.plum,
      fontFamily: retroFonts.heading,
      textTransform: 'uppercase',
   },
   headline: {
      fontSize: 13,
      fontWeight: '400',
      color: retroPalette.violet,
      marginTop: 2,
      fontFamily: retroFonts.base,
   },
   sign: {
      marginLeft: 12,
      width: 36,
      height: 28,
      borderWidth: 2,
      borderColor: retroPalette.outline,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f4c9ff',
   },
   signText: {
      fontSize: 18,
      fontWeight: '700',
      color: retroPalette.outline,
   },
});
