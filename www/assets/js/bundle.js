// bundle.js
console.log("Loaded bundle");

const firebaseConfig = {
  apiKey: "AIzaSyCSYnONep2jhhpP_Ntr-T6ujTDvwOQabqQ",
    authDomain: "pa-sha.firebaseapp.com",
    projectId: "pa-sha",
    storageBucket: "pa-sha.appspot.com",
    messagingSenderId: "281409245795",
    appId: "1:281409245795:web:8852c2f727c3f401029e56"
};

firebase.initializeApp(firebaseConfig);

const storage = firebase.storage();
const firestore = firebase.firestore();

if (firebase.app()) {
    console.log("Firebase is connected!");
} else {
    console.error("Firebase is not connected!");
}
