import { Platform } from 'react-native';

export const retroFonts = {
   base: Platform.select({
      ios: 'Courier',
      android: 'monospace',
      default: 'Courier New',
   }),
   heading: Platform.select({
      ios: 'Copperplate',
      android: 'monospace',
      default: 'Courier New',
   }),
};

export const retroPalette = {
   sunsetStart: '#f7c26d',
   sunsetEnd: '#f05b5f',
   violet: '#6d30a8',
   plum: '#311b44',
   lilac: '#d8b4e2',
   warmSand: '#fff2d7',
   melon: '#f9a03f',
   coral: '#ff6f61',
   yellow: '#ffe26f',
   menuGray: '#cfd0d4',
   menuText: '#1f1d2b',
   outline: '#2d0a3a',
   teal: '#44bba4',
};

export const retroMenuItems = ['File', 'Edit', 'Search', 'Help'];
