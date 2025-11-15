import React, { useState, useRef, useEffect } from 'react';
import {
   View,
   Text,
   TouchableOpacity,
   StyleSheet,
   Alert,
   ActivityIndicator,
   Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { BASE_URL } from '../config';

export default function UploadScreen() {
   const [file, setFile] = useState(null);
   const [processing, setProcessing] = useState(false);
   const [result, setResult] = useState(null);
   const [steps, setSteps] = useState([]);
   const progressTimer = useRef(null);

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
      <View style={styles.container}>
         <View style={styles.uploadBox}>
            <Text style={styles.title}>Upload Video</Text>

            <TouchableOpacity style={styles.selectButton} onPress={pickVideo}>
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

         {result && (
            <View style={styles.resultBox}>
               <Text style={styles.resultTitle}>
                  {result.ok ? 'Processing complete' : 'Processing failed'}
               </Text>
               <Text style={styles.resultText}>
                  {JSON.stringify(result.data)}
               </Text>
            </View>
         )}
      </View>
   );
}

const styles = StyleSheet.create({
   container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fff',
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
});
