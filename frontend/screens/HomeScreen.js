import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

export default function HomeScreen() {
   return (
      <View style={styles.container}>
         <Text style={styles.title}>Home</Text>
         <Text style={styles.subtitle}>Welcome — this is the homepage.</Text>
      </View>
   );
}

const styles = StyleSheet.create({
   container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fff',
   },
   title: {
      fontSize: 28,
      fontWeight: '700',
      color: '#000',
      marginBottom: 8,
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
   subtitle: {
      fontSize: 16,
      color: '#333',
      fontFamily:
         Platform.OS === 'ios'
            ? 'American Typewriter'
            : Platform.OS === 'android'
            ? 'monospace'
            : 'Courier New',
   },
});
