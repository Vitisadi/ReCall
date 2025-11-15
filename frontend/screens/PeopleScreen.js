import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import axios from 'axios';
import { BASE_URL } from '../config';

export default function PeopleScreen({ onOpenConversation }) {
   const [people, setPeople] = useState([]);
   const [assistantInput, setAssistantInput] = useState('');
   const [assistantHistory, setAssistantHistory] = useState([]);
   const [assistantLoading, setAssistantLoading] = useState(false);
   const [assistantError, setAssistantError] = useState('');

   useEffect(() => {
      axios
         .get(`${BASE_URL}/api/people`)
         .then((res) => {
            console.log('API Response:', res.data);
            setPeople(res.data);
         })
         .catch((err) => console.error('API Error:', err));
   }, []);

   const handleAskAssistant = async () => {
      const question = assistantInput.trim();
      if (!question || assistantLoading) return;

      setAssistantLoading(true);
      setAssistantError('');

      try {
         const res = await axios.post(`${BASE_URL}/api/people/assistant`, {
            question,
         });

         setAssistantHistory((prev) => [
            ...prev,
            {
               id: Date.now().toString(),
               question,
               answer: res.data?.answer,
               match: res.data?.match,
            },
         ]);
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
         onOpenConversation(match.name);
         return;
      }
      if (match.profile_url) {
         Linking.openURL(match.profile_url).catch(() => {
            console.warn('Could not open profile link.');
         });
      }
   };

   return (
      <ScrollView contentContainerStyle={styles.container}>
         <View style={styles.assistantCard}>
            <Text style={styles.assistantTitle}>Ask Everyone</Text>
            <Text style={styles.assistantSubtitle}>
               Type a question to search across all saved conversations.
            </Text>
            <View style={styles.assistantInputRow}>
               <TextInput
                  value={assistantInput}
                  onChangeText={setAssistantInput}
                  style={styles.assistantInput}
                  placeholder='e.g., Who finished the lab?'
                  placeholderTextColor='#999'
                  returnKeyType='send'
                  onSubmitEditing={handleAskAssistant}
               />
               <TouchableOpacity
                  style={[
                     styles.assistantButton,
                     assistantLoading && styles.assistantButtonDisabled,
                  ]}
                  onPress={handleAskAssistant}
                  disabled={assistantLoading}
               >
                  {assistantLoading ? (
                     <ActivityIndicator color='#000' size='small' />
                  ) : (
                     <Text style={styles.assistantButtonText}>Ask</Text>
                  )}
               </TouchableOpacity>
            </View>
            {assistantError ? (
               <Text style={styles.assistantError}>{assistantError}</Text>
            ) : null}
            {assistantHistory.map((entry) => (
               <View key={entry.id} style={styles.assistantResponse}>
                  <Text style={styles.assistantLabel}>You</Text>
                  <Text style={styles.assistantQuestion}>{entry.question}</Text>
                  <Text style={styles.assistantLabel}>Assistant</Text>
                  {entry.match?.excerpt?.length ? (
                     <View style={styles.assistantExcerpt}>
                        {entry.match.excerpt.map((turn, idx) => (
                           <Text
                              key={`${entry.id}-ex-${idx}`}
                              style={[
                                 styles.assistantExcerptLine,
                                 turn.is_highlight &&
                                    styles.assistantExcerptHighlight,
                              ]}
                           >
                              <Text style={styles.assistantExcerptSpeaker}>
                                 {turn.speaker}:{' '}
                              </Text>
                              {turn.text}
                           </Text>
                        ))}
                     </View>
                  ) : (
                     <Text style={styles.assistantAnswer}>{entry.answer}</Text>
                  )}
                  {entry.match?.name ? (
                     <TouchableOpacity
                        style={styles.assistantLink}
                        onPress={() => handleOpenProfile(entry.match)}
                     >
                        <Text style={styles.assistantLinkText}>
                           View {entry.match.name}’s profile
                        </Text>
                     </TouchableOpacity>
                  ) : null}
               </View>
            ))}
         </View>
         <Text style={styles.header}>People You’ve Talked To</Text>
         {people.map((person, index) => (
            <View key={index} style={styles.card}>
               <Image source={{ uri: person.image_url }} style={styles.image} />
               <Text style={styles.name}>{person.name || 'Unknown'}</Text>

               <TouchableOpacity
                  style={styles.sign}
                  onPress={() =>
                     onOpenConversation
                        ? onOpenConversation(person.name)
                        : console.log('Open chat with', person.name)
                  }
               >
                  <Text style={styles.signText}>➜</Text>
               </TouchableOpacity>
            </View>
         ))}
      </ScrollView>
   );
}

const styles = StyleSheet.create({
   container: { padding: 16, marginTop: 36, backgroundColor: '#fff' },
   assistantCard: {
      padding: 16,
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 8,
      backgroundColor: '#fdfdfd',
      marginBottom: 24,
   },
   assistantTitle: {
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 4,
      color: '#000',
   },
   assistantSubtitle: {
      fontSize: 14,
      color: '#333',
      marginBottom: 12,
   },
   assistantInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
   },
   assistantInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      fontSize: 16,
      color: '#000',
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
