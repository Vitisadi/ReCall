import React, { useState, useRef, useEffect } from 'react';
import {
   View,
   Text,
   TouchableOpacity,
   StyleSheet,
   Alert,
   ActivityIndicator,
   Platform,
   Image,
   TextInput,
   ScrollView,
   KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { BASE_URL } from '../config';

export default function UploadScreen() {
   const [file, setFile] = useState(null);
   const [processing, setProcessing] = useState(false);
   const [result, setResult] = useState(null);
   const [steps, setSteps] = useState([]);
   const progressTimer = useRef(null);
   const [isEditingName, setIsEditingName] = useState(false);
   const [editedName, setEditedName] = useState('');
   const [showConfirmPrompt, setShowConfirmPrompt] = useState(false);
   const [keywordsVisible, setKeywordsVisible] = useState(false);
   const [linkedinUrl, setLinkedinUrl] = useState(null);
   const [linkedinLoading, setLinkedinLoading] = useState(false);
   const [linkedinProgress, setLinkedinProgress] = useState(0);
   const linkedinTimer = useRef(null);
   const [linkedinMessage, setLinkedinMessage] = useState('');

   const pickVideo = async () => {
      try {
         const { status } =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
         if (status !== 'granted') {
            Alert.alert(
               'Permission required',
               'Permission to access photos is required to select a video.'
            );
            return;
         }

         const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            allowsEditing: false,
            quality: 0.8,
         });

         // Handle both old and new response shapes
         if (res.cancelled === false || res.canceled === false || res.assets) {
            const asset = res.assets ? res.assets[0] : res;
            const uri = asset.uri;
            const name = asset.fileName || asset.name || uri.split('/').pop();
            setFile({ uri, name, mimeType: asset.type || 'video/mp4' });
            setResult(null);
         }
      } catch (e) {
         console.error(e);
         Alert.alert('Error', 'Could not pick video');
      }
   };

   const processVideo = async () => {
      if (!file) return;
      setProcessing(true);
      setResult(null);
      // initialize steps: Upload -> Analyze -> Transcription
      setSteps([
         { key: 'upload', label: 'Uploading', progress: 0, done: false },
         { key: 'analyze', label: 'analyze_video', progress: 0, done: false },
         {
            key: 'transcription',
            label: 'Transcription',
            progress: 0,
            done: false,
         },
      ]);
      try {
         const uri = file.uri;
         const name = file.name || uri.split('/').pop();
         const type = file.mimeType || 'video/mp4';

         const form = new FormData();
         form.append('file', {
            uri,
            name,
            type,
         });

         // Kick off a fetch in parallel while simulating progress UI.
         const fetchPromise = fetch(`${BASE_URL}/api/process`, {
            method: 'POST',
            headers: {
               'Content-Type': 'multipart/form-data',
            },
            body: form,
         });

         // Simulate upload progress while fetch is pending
         await simulateUploadWhile(fetchPromise);

         const res = await fetchPromise;
         const data = await res.json();
         setResult({ ok: res.ok, data });
         if (!res.ok) {
            Alert.alert('Server Error', JSON.stringify(data));
         }
      } catch (e) {
         console.error(e);
         Alert.alert('Upload failed', String(e));
      } finally {
         // ensure steps reach final state
         setProcessing(false);
      }
   };

   useEffect(() => {
      return () => {
         if (progressTimer.current) clearInterval(progressTimer.current);
         if (linkedinTimer.current) clearInterval(linkedinTimer.current);
      };
   }, []);

   const simulateUploadWhile = async (fetchPromise) => {
      // increment the upload progress while fetch is pending
      return new Promise((resolve) => {
         let tick = 0;
         progressTimer.current = setInterval(() => {
            tick += 1;
            setSteps((prev) => {
               if (!prev || prev.length === 0) return prev;
               const next = [...prev];
               const idx = 0; // upload step
               const cur = { ...next[idx] };
               // increase a bit faster up to 94 while pending
               cur.progress = Math.min(
                  94,
                  cur.progress + (5 + Math.random() * 9)
               );
               next[idx] = cur;
               return next;
            });
            // if fetch completed, finalize upload progress and move to next steps
            if (fetchPromise && typeof fetchPromise.then === 'function') {
               // cannot synchronously detect promise state; rely on fetch resolution via its then
            }
            // safety: after many ticks, stop to avoid runaway
            if (tick > 60) {
               clearInterval(progressTimer.current);
               progressTimer.current = null;
            }
         }, 300);

         // when fetchPromise resolves, run the remaining animations
         fetchPromise
            .then(() => {
               if (progressTimer.current) {
                  clearInterval(progressTimer.current);
                  progressTimer.current = null;
               }
               // mark upload done
               setSteps((prev) => {
                  if (!prev) return prev;
                  const copy = [...prev];
                  copy[0] = { ...copy[0], progress: 100, done: true };
                  return copy;
               });

               // sequentially animate analyze and transcription
               animateStepToDone(1, 700).then(() =>
                  animateStepToDone(2, 900).then(resolve)
               );
            })
            .catch(() => {
               if (progressTimer.current) {
                  clearInterval(progressTimer.current);
                  progressTimer.current = null;
               }
               resolve();
            });
      });
   };

   const animateStepToDone = (index, duration) => {
      return new Promise((resolve) => {
         const start = Date.now();
         const initial = steps && steps[index] ? steps[index].progress || 0 : 0;
         const timer = setInterval(() => {
            const elapsed = Date.now() - start;
            const pct = Math.min(
               100,
               initial + (elapsed / duration) * (100 - initial)
            );
            setSteps((prev) => {
               if (!prev) return prev;
               const next = [...prev];
               next[index] = { ...next[index], progress: pct };
               return next;
            });
            if (pct >= 100) {
               clearInterval(timer);
               setSteps((prev) => {
                  if (!prev) return prev;
                  const next = [...prev];
                  next[index] = { ...next[index], progress: 100, done: true };
                  return next;
               });
               resolve();
            }
         }, 80);
      });
   };

   const triggerLinkedInEnrichment = async (personName, options = {}) => {
      if (!personName) return;
      try {
         const response = await fetch(
            `${BASE_URL}/api/conversation/${encodeURIComponent(
               personName
            )}/linkedin`,
            {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ force: Boolean(options.force) }),
            }
         );
         if (response.ok) {
            const data = await response.json();
            // Save LinkedIn URL if found
            if (data.linkedin) {
               setLinkedinUrl(data.linkedin);
            }
         } else {
            const errorData = await response.json().catch(() => ({}));
            console.warn(
               'LinkedIn enrichment failed',
               errorData.error || response.statusText
            );
         }
      } catch (err) {
         console.warn('LinkedIn enrichment request error', err);
      }
   };

   // Fetch latest headline from the conversation file and update card
   const updateHeadlineFromConversation = async (personName) => {
      if (!personName) return;
      try {
         const resp = await fetch(
            `${BASE_URL}/api/conversation/${encodeURIComponent(personName)}`
         );
         if (!resp.ok) return;
         const payload = await resp.json();
         const conversations = Array.isArray(payload?.conversation)
            ? payload.conversation
            : [];
         let latestHeadline = '';
         for (let i = conversations.length - 1; i >= 0; i--) {
            const entry = conversations[i];
            if (
               entry &&
               typeof entry.headline === 'string' &&
               entry.headline.trim()
            ) {
               latestHeadline = entry.headline.trim();
               break;
            }
         }
         if (latestHeadline) {
            setResult((prev) =>
               prev
                  ? {
                       ...prev,
                       data: { ...prev.data, headline: latestHeadline },
                    }
                  : prev
            );
         }
      } catch (_) {
         // ignore refresh errors silently
      }
   };

   // Format a headline for display (length cap)
   const formatHeadline = (s) => {
      if (!s || typeof s !== 'string') return '';
      const t = s.trim();
      return t.length > 50 ? `${t.slice(0, 50).trim()}…` : t;
   };

   // Simple horizontal progress bar used for each step
   const ProgressBar = ({ progress }) => {
      return (
         <View style={styles.progressBar}>
            <View
               style={[
                  styles.progressFill,
                  { width: `${Math.round(progress)}%` },
               ]}
            />
         </View>
      );
   };

   return (
      <KeyboardAvoidingView
         style={styles.container}
         behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
         keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
         <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps='handled'
         >
            <View style={styles.uploadBox}>
               <Text style={styles.title}>Upload Video</Text>

               <TouchableOpacity
                  style={styles.selectButton}
                  onPress={pickVideo}
               >
                  <Text style={styles.selectButtonText}>
                     {file ? file.name : 'Select Video'}
                  </Text>
               </TouchableOpacity>

               {file && (
                  <TouchableOpacity
                     style={styles.processButton}
                     onPress={processVideo}
                     disabled={processing}
                  >
                     {processing ? (
                        <ActivityIndicator color='#fff' />
                     ) : (
                        <Text style={styles.processButtonText}>Process</Text>
                     )}
                  </TouchableOpacity>
               )}
            </View>

            {steps && steps.length > 0 && (
               <View style={styles.stepsContainer}>
                  {steps.map((s, i) => (
                     <View key={s.key} style={styles.stepRow}>
                        <View style={{ flex: 1 }}>
                           <Text style={styles.stepLabel}>{s.label}</Text>
                           <ProgressBar progress={s.progress || 0} />
                        </View>
                        <View style={styles.stepStatus}>
                           {s.done ? (
                              <Text style={styles.check}>✅</Text>
                           ) : processing &&
                             i === steps.findIndex((x) => !x.done) ? (
                              <ActivityIndicator size='small' color='#000' />
                           ) : (
                              <Text style={styles.percent}>
                                 {Math.round(s.progress || 0)}%
                              </Text>
                           )}
                        </View>
                     </View>
                  ))}
               </View>
            )}

            {result && result.ok && result.data.face_name && (
               <View style={styles.successCard}>
                  <View style={styles.cardContent}>
                     <Image
                        source={{
                           uri: `${BASE_URL}/faces/${result.data.face_name.toLowerCase()}.jpg`,
                        }}
                        style={styles.cardImage}
                     />
                     <View style={styles.cardTextWrapper}>
                        {!isEditingName && !showConfirmPrompt && (
                           <>
                              <Text style={styles.cardName}>
                                 {result.data.face_name.toUpperCase()}
                              </Text>
                              <Text style={styles.cardSubtext}>
                                 {result.data.headline
                                    ? formatHeadline(result.data.headline)
                                    : 'Conversation saved'}
                              </Text>
                           </>
                        )}
                        {isEditingName && !showConfirmPrompt && (
                           <TextInput
                              style={styles.nameInput}
                              value={editedName}
                              onChangeText={setEditedName}
                              autoFocus
                              placeholder='Enter name'
                              returnKeyType='done'
                              onSubmitEditing={() => {
                                 if (editedName.trim()) {
                                    setShowConfirmPrompt(true);
                                 } else {
                                    Alert.alert(
                                       'Error',
                                       'Name cannot be empty'
                                    );
                                 }
                              }}
                           />
                        )}
                        {showConfirmPrompt && (
                           <View style={styles.confirmBlock}>
                              <Text style={styles.confirmQuestion}>
                                 Is this name right?
                              </Text>
                              <Text style={styles.proposedName}>
                                 {editedName.trim().toUpperCase()}
                              </Text>
                           </View>
                        )}
                     </View>
                     {/* Action buttons */}
                     {result.data.face_status !== 'old' &&
                        !isEditingName &&
                        !showConfirmPrompt &&
                        !keywordsVisible && (
                           <TouchableOpacity
                              style={styles.editButton}
                              onPress={() => {
                                 setIsEditingName(true);
                                 setEditedName(result.data.face_name);
                              }}
                           >
                              <Text style={styles.editIcon}>✏️</Text>
                           </TouchableOpacity>
                        )}
                     {isEditingName && !showConfirmPrompt && (
                        <TouchableOpacity
                           style={styles.reviewButton}
                           onPress={() => {
                              if (!editedName.trim()) {
                                 Alert.alert('Error', 'Name cannot be empty');
                                 return;
                              }
                              setShowConfirmPrompt(true);
                           }}
                        >
                           <Text style={styles.reviewText}>Review</Text>
                        </TouchableOpacity>
                     )}
                     {showConfirmPrompt && (
                        <View style={styles.confirmButtonsRow}>
                           <TouchableOpacity
                              style={styles.yesButton}
                              onPress={async () => {
                                 const newName = editedName.trim();
                                 if (!newName) {
                                    Alert.alert(
                                       'Error',
                                       'Name cannot be empty'
                                    );
                                    return;
                                 }
                                 // If unchanged, just exit without calling backend
                                 if (
                                    newName.toLowerCase() ===
                                    result.data.face_name.toLowerCase()
                                 ) {
                                    // Do not fetch LinkedIn or show keywords yet; mirror non-edit flow
                                    setIsEditingName(false);
                                    setShowConfirmPrompt(false);
                                    setKeywordsVisible(false);
                                    Alert.alert(
                                       'Saved',
                                       'Name unchanged. Tap CONFIRM to continue.'
                                    );
                                    return;
                                 }
                                 try {
                                    const res = await fetch(
                                       `${BASE_URL}/api/rename`,
                                       {
                                          method: 'POST',
                                          headers: {
                                             'Content-Type': 'application/json',
                                          },
                                          body: JSON.stringify({
                                             old_name: result.data.face_name,
                                             new_name: newName,
                                          }),
                                       }
                                    );
                                    const data = await res.json();
                                    if (res.ok) {
                                       setResult({
                                          ...result,
                                          data: {
                                             ...result.data,
                                             face_name: newName,
                                          },
                                       });
                                       // Defer enrichment to the CONFIRM action for consistent flow
                                       setIsEditingName(false);
                                       setShowConfirmPrompt(false);
                                       setKeywordsVisible(false);
                                       Alert.alert(
                                          'Success',
                                          'Name updated! Tap CONFIRM to continue.'
                                       );
                                    } else {
                                       Alert.alert(
                                          'Error',
                                          data.error || 'Failed to rename'
                                       );
                                    }
                                 } catch (e) {
                                    Alert.alert('Error', String(e));
                                 }
                              }}
                           >
                              <Text style={styles.yesText}>Yes</Text>
                           </TouchableOpacity>
                           <TouchableOpacity
                              style={styles.cancelButton}
                              onPress={() => {
                                 setShowConfirmPrompt(false);
                                 // stay in editing mode to adjust further
                              }}
                           >
                              <Text style={styles.cancelText}>Cancel</Text>
                           </TouchableOpacity>
                        </View>
                     )}
                  </View>
                  {keywordsVisible &&
                     Array.isArray(result.data.keywords) &&
                     result.data.keywords.length > 0 && (
                        <View style={styles.keywordsBox}>
                           <Text style={styles.keywordsTitle}>
                              Keywords found:
                           </Text>
                           <View style={styles.keywordsRow}>
                              {result.data.keywords.map((kw) => (
                                 <View key={kw} style={styles.keywordPill}>
                                    <Text style={styles.keywordText}>{kw}</Text>
                                 </View>
                              ))}
                           </View>
                        </View>
                     )}
                  {keywordsVisible &&
                     (!result.data.keywords ||
                        result.data.keywords.length === 0) && (
                        <View style={styles.keywordsBox}>
                           <Text style={styles.keywordsTitle}>
                              No searchable keywords detected.
                           </Text>
                        </View>
                     )}
                  {keywordsVisible && linkedinUrl && (
                     <View style={styles.linkedinWrapper}>
                        <Text style={styles.experimentalFlag}>
                           Experimental Feature
                        </Text>
                        <TouchableOpacity
                           style={styles.linkedinBox}
                           onPress={() => {
                              // Open LinkedIn URL in browser
                              if (Platform.OS === 'web') {
                                 window.open(linkedinUrl, '_blank');
                              } else {
                                 const { Linking } = require('react-native');
                                 Linking.openURL(linkedinUrl);
                              }
                           }}
                        >
                           <View style={styles.linkedinContent}>
                              <Text style={styles.linkedinIcon}>in</Text>
                              <Text style={styles.linkedinText}>
                                 View LinkedIn Profile
                              </Text>
                           </View>
                        </TouchableOpacity>
                        <Text style={styles.linkedinUrlText}>
                           {linkedinUrl}
                        </Text>
                     </View>
                  )}
               </View>
            )}
            {result &&
               result.ok &&
               result.data.face_name &&
               !isEditingName &&
               !showConfirmPrompt &&
               !keywordsVisible && (
                  <>
                     {result.data.has_linkedin_potential ? (
                        <>
                           <TouchableOpacity
                              style={styles.confirmAcceptButton}
                              onPress={async () => {
                                 if (
                                    !result?.data?.face_name ||
                                    linkedinLoading
                                 )
                                    return;
                                 setLinkedinLoading(true);
                                 setLinkedinProgress(0);
                                 // simple progress animation
                                 linkedinTimer.current = setInterval(() => {
                                    setLinkedinProgress((p) =>
                                       Math.min(94, p + (5 + Math.random() * 7))
                                    );
                                 }, 280);
                                 try {
                                    await triggerLinkedInEnrichment(
                                       result.data.face_name
                                    );
                                    await updateHeadlineFromConversation(
                                       result.data.face_name
                                    );
                                 } finally {
                                    if (linkedinTimer.current) {
                                       clearInterval(linkedinTimer.current);
                                       linkedinTimer.current = null;
                                    }
                                    setLinkedinProgress(100);
                                    setLinkedinLoading(false);
                                    // Always reveal keywords after enrichment attempt
                                    setKeywordsVisible(true);
                                 }
                              }}
                           >
                              <Text style={styles.confirmAcceptText}>
                                 Find More Data
                              </Text>
                           </TouchableOpacity>
                           {linkedinLoading && (
                              <View style={{ width: '100%', marginTop: 8 }}>
                                 <ProgressBar progress={linkedinProgress} />
                              </View>
                           )}
                        </>
                     ) : (
                        <View
                           style={{
                              marginTop: 12,
                              width: '100%',
                              alignItems: 'center',
                           }}
                        >
                           <Text
                              style={{
                                 fontSize: 14,
                                 color: '#666',
                                 fontFamily:
                                    Platform.OS === 'ios'
                                       ? 'American Typewriter'
                                       : Platform.OS === 'android'
                                       ? 'monospace'
                                       : 'Courier New',
                              }}
                           >
                              Conversation recorded
                           </Text>
                        </View>
                     )}
                  </>
               )}

            {result && !result.ok && (
               <View style={styles.resultBox}>
                  <Text style={styles.resultTitle}>Processing failed</Text>
                  <Text style={styles.resultText}>
                     {JSON.stringify(result.data)}
                  </Text>
               </View>
            )}
         </ScrollView>
      </KeyboardAvoidingView>
   );
}

const styles = StyleSheet.create({
   container: {
      flex: 1,
      backgroundColor: '#fff',
   },
   scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
   },
   title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
      color: '#000',
      textAlign: 'center',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   uploadBox: {
      width: '100%',
      borderWidth: 2,
      borderColor: '#000',
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      backgroundColor: '#fff',
   },
   selectButton: {
      width: '100%',
      backgroundColor: '#eee',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 12,
   },
   selectButtonText: {
      color: '#333',
      fontSize: 16,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   processButton: {
      width: '100%',
      backgroundColor: '#007AFF',
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 8,
   },
   processButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   resultBox: {
      marginTop: 16,
      width: '100%',
      backgroundColor: '#f7f7f7',
      padding: 12,
      borderRadius: 8,
   },
   resultTitle: {
      fontWeight: '700',
      marginBottom: 8,
   },
   resultText: {
      fontSize: 12,
      color: '#333',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   note: {
      marginTop: 16,
      fontSize: 12,
      color: '#666',
      textAlign: 'center',
   },
   stepsContainer: {
      marginTop: 16,
      width: '100%',
   },
   stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      backgroundColor: '#fff',
      padding: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#000',
   },
   stepLabel: {
      fontSize: 13,
      color: '#000',
      marginBottom: 6,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   stepStatus: {
      width: 48,
      alignItems: 'center',
      justifyContent: 'center',
   },
   progressBar: {
      height: 8,
      backgroundColor: '#eee',
      borderRadius: 6,
      overflow: 'hidden',
   },
   progressFill: {
      height: 8,
      backgroundColor: '#000',
   },
   check: {
      fontSize: 16,
   },
   percent: {
      fontSize: 12,
      color: '#222',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   successCard: {
      marginTop: 24,
      width: '100%',
      backgroundColor: '#fff',
      borderWidth: 2,
      borderColor: '#000',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
   },
   cardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
   },
   cardImage: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: '#000',
      marginRight: 12,
   },
   cardTextWrapper: {
      flex: 1,
   },
   cardName: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#000',
      marginBottom: 4,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   cardSubtext: {
      fontSize: 13,
      color: '#666',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   editButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 8,
      backgroundColor: '#fff',
   },
   editIcon: {
      fontSize: 18,
   },
   confirmButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#000',
      borderRadius: 8,
      backgroundColor: '#000',
   },
   confirmIcon: {
      fontSize: 20,
      color: '#fff',
      fontWeight: 'bold',
   },
   nameInput: {
      fontSize: 16,
      color: '#000',
      borderWidth: 1,
      borderColor: '#000',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   reviewButton: {
      width: 70,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#000',
      borderRadius: 8,
      backgroundColor: '#fff',
      marginLeft: 8,
   },
   reviewText: {
      fontSize: 14,
      color: '#000',
      fontWeight: '600',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   confirmBlock: {
      marginTop: 4,
      marginBottom: 4,
   },
   confirmQuestion: {
      fontSize: 13,
      color: '#000',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   proposedName: {
      fontSize: 16,
      fontWeight: 'bold',
      marginTop: 2,
      color: '#000',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   confirmButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 8,
   },
   yesButton: {
      paddingHorizontal: 14,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#000',
      marginRight: 8,
   },
   yesText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   cancelButton: {
      paddingHorizontal: 14,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fff',
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#000',
   },
   cancelText: {
      color: '#000',
      fontWeight: '600',
      fontSize: 14,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   confirmViewButton: {
      width: 90,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#000',
      borderRadius: 8,
      backgroundColor: '#fff',
      marginLeft: 8,
   },
   confirmViewText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#000',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   keywordsBox: {
      marginTop: 16,
      width: '100%',
      borderWidth: 2,
      borderColor: '#000',
      borderRadius: 10,
      padding: 12,
      backgroundColor: '#fff',
   },
   keywordsTitle: {
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 8,
      color: '#000',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   keywordsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
   },
   keywordPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: '#000',
      borderRadius: 20,
      marginRight: 8,
      marginBottom: 8,
   },
   keywordText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   confirmAcceptButton: {
      marginTop: 12,
      width: '100%',
      backgroundColor: '#000',
      paddingVertical: 14,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: '#000',
      alignItems: 'center',
      justifyContent: 'center',
   },
   confirmAcceptText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 1,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   linkedinBox: {
      marginTop: 16,
      width: '100%',
      borderWidth: 2,
      borderColor: '#0077B5',
      borderRadius: 10,
      padding: 12,
      backgroundColor: '#fff',
   },
   linkedinContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
   },
   linkedinIcon: {
      fontSize: 24,
      fontWeight: '700',
      color: '#0077B5',
      backgroundColor: '#0077B5',
      color: '#fff',
      width: 32,
      height: 32,
      lineHeight: 32,
      textAlign: 'center',
      borderRadius: 4,
      marginRight: 12,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   linkedinText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#0077B5',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   linkedinWrapper: {
      marginTop: 16,
      width: '100%',
      alignItems: 'center',
   },
   experimentalFlag: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      color: '#0077B5',
      marginBottom: 6,
      textTransform: 'uppercase',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   linkedinUrlText: {
      marginTop: 8,
      fontSize: 12,
      color: '#333',
      textAlign: 'center',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
});
