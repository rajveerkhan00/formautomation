import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDg7OY_4DbI2Irh6zmez4lWfafa12OlrBc",
    authDomain: "formsdata-a63b0.firebaseapp.com",
    projectId: "formsdata-a63b0",
    storageBucket: "formsdata-a63b0.firebasestorage.app",
    messagingSenderId: "167954523375",
    appId: "1:167954523375:web:7ec58360b08c61401aa71a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
