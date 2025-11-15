import React, { useState } from 'react';
import {
   View,
   StyleSheet,
   TouchableOpacity,
   Text,
   Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './screens/HomeScreen';
import PeopleScreen from './screens/PeopleScreen';
import UploadScreen from './screens/UploadScreen';
import ConversationScreen from './screens/ConversationScreen';

export default function App() {
   const [activeTab, setActiveTab] = useState('home');
   const [activeConversation, setActiveConversation] = useState(null);

   const handleOpenConversation = (payload) => {
      if (!payload) return;
      if (typeof payload === 'string') {
         setActiveConversation({ name: payload });
         return;
      }

      if (payload && typeof payload === 'object') {
         const { name, highlightTimestamp, highlightIndex } = payload;
         if (!name) return;
         setActiveConversation({
            name,
            highlightTimestamp,
            highlightIndex,
         });
      }
   };

   return (
      <SafeAreaView style={{ flex: 1 }}>
         <View style={styles.container}>
            {activeConversation ? (
               <ConversationScreen
                  name={activeConversation.name}
                  highlightTimestamp={activeConversation.highlightTimestamp}
                  highlightIndex={activeConversation.highlightIndex}
                  onBack={() => setActiveConversation(null)}
               />
            ) : (
               <>
                  {activeTab === 'home' && <HomeScreen />}
                  {activeTab === 'upload' && <UploadScreen />}
                  {activeTab === 'contact' && (
                     <PeopleScreen
                        onOpenConversation={handleOpenConversation}
                     />
                  )}
               </>
            )}

            {/* Bottom Navigation */}
            <View style={styles.navBar}>
               <TouchableOpacity
                  style={[
                     styles.navItem,
                     activeTab === 'home' && styles.navItemActive,
                  ]}
                  onPress={() => {
                     setActiveConversation(null);
                     setActiveTab('home');
                  }}
               >
                  <Text
                     style={[
                        styles.navText,
                        activeTab === 'home' && styles.navTextActive,
                     ]}
                  >
                     Home
                  </Text>
               </TouchableOpacity>

               <TouchableOpacity
                  style={[
                     styles.navItem,
                     styles.navSeparator,
                     activeTab === 'upload' && styles.navItemActive,
                  ]}
                  onPress={() => {
                     setActiveConversation(null);
                     setActiveTab('upload');
                  }}
               >
                  <Text
                     style={[
                        styles.navText,
                        activeTab === 'upload' && styles.navTextActive,
                     ]}
                  >
                     Upload
                  </Text>
               </TouchableOpacity>

               <TouchableOpacity
                  style={[
                     styles.navItem,
                     styles.navSeparator,
                     activeTab === 'contact' && styles.navItemActive,
                  ]}
                  onPress={() => {
                     setActiveConversation(null);
                     setActiveTab('contact');
                  }}
               >
                  <Text
                     style={[
                        styles.navText,
                        activeTab === 'contact' && styles.navTextActive,
                     ]}
                  >
                     Contact
                  </Text>
               </TouchableOpacity>
            </View>
         </View>
      </SafeAreaView>
   );
}

const styles = StyleSheet.create({
   container: {
      flex: 1,
      backgroundColor: '#fff',
   },
   navBar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: '#ddd',
      backgroundColor: '#fff',
      height: 64,
      alignItems: 'center',
   },
   navItem: {
      flex: 1,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
   },
   navItemActive: {
      borderTopWidth: 3,
      borderTopColor: '#007AFF',
   },
   navText: {
      fontSize: 14,
      color: '#000',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
      fontWeight: '700',
      textTransform: 'uppercase',
   },
   navTextActive: {
      color: '#007AFF',
      fontWeight: '600',
   },
});
