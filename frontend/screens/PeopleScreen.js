import React, { useEffect, useState } from 'react';
import {
   View,
   Text,
   Image,
   TouchableOpacity,
   ScrollView,
   StyleSheet,
   Platform,
} from 'react-native';
import axios from 'axios';
import { BASE_URL } from '../config';

export default function PeopleScreen({ onOpenConversation }) {
   const [people, setPeople] = useState([]);
   useEffect(() => {
      axios
         .get(`${BASE_URL}/api/people`)
         .then((res) => {
            console.log('API Response:', res.data);
            setPeople(res.data);
         })
         .catch((err) => console.error('API Error:', err));
   }, []);

   return (
      <ScrollView contentContainerStyle={styles.container}>
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
