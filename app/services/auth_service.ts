import {
    browserLocalPersistence,
    browserSessionPersistence,
    setPersistence,
    signInWithEmailAndPassword,
} from "firebase/auth";

import { auth } from "./firebase_app";

export type LoginInput = {
    email: string;
    password: string;
    remember?: boolean; // if true: persist across browser restarts
};

export async function loginWithEmail(input: LoginInput) {
    const remember = input.remember ?? true;

    await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
    );

    const cred = await signInWithEmailAndPassword(
        auth,
        input.email,
        input.password
    );

    return cred;
}
