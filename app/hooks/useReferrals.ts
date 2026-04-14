import { useEffect, useState } from "react";
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    getDoc,
    updateDoc,
    addDoc,
    Timestamp,
} from "firebase/firestore";
import { db } from "~/firebase";
import type { Referral, ReferralWithProvider } from "~/types/referral";
import type { User } from "~/types/user";

export function useReferrals(patientId: string) {
    const [referrals, setReferrals] = useState<ReferralWithProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!patientId) {
            setReferrals([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, "referrals", patientId, "referrals"),
            where("isDeleted", "==", false),
            orderBy("dateSubmitted", "desc")
        );

        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                try {
                    const baseReferrals = snapshot.docs.map((d) => ({
                        id: d.id,
                        ...d.data(),
                    })) as Referral[];

                    // Perform the "join" by fetching associated users
                    const populatedReferrals = await Promise.all(
                        baseReferrals.map(async (ref) => {
                            let socialWorker: User | undefined;

                            // Fetch referring Social Worker
                            if (ref.socialWorkerId) {
                                const swDoc = await getDoc(
                                    doc(db, "users", ref.socialWorkerId)
                                );
                                if (swDoc.exists()) {
                                    socialWorker = {
                                        uid: swDoc.id,
                                        ...swDoc.data(),
                                    } as User;
                                }
                            }

                            return {
                                ...ref,
                                socialWorker,
                            };
                        })
                    );

                    setReferrals(populatedReferrals);
                    setLoading(false);
                } catch (err: unknown) {
                    console.error("Error populating referrals:", err);
                    setError(
                        err instanceof Error ? err.message : "Unknown error"
                    );
                    setLoading(false);
                }
            },
            (err: unknown) => {
                console.error("Error fetching referrals:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [patientId]);

    return { referrals, loading, error };
}

export interface ReferralFormData {
    patientId: string;
    socialWorkerId: string;

    // added to track referral contact info
    referralFirstName: string;
    referralLastName: string;
    referralTitle?: string;
    referralEmail?: string;
    referralPhone?: string;

    type: string;
    status: string;
    notes: string;
    websiteUrl: string;
}

export async function addReferral(
    patientId: string,
    data: ReferralFormData
): Promise<string> {
    const docRef = await addDoc(
        collection(db, "referrals", patientId, "referrals"),
        {
            ...data,
            patientId,
            dateSubmitted: Timestamp.now(),
            lastUpdated: Timestamp.now(),
            isDeleted: false,
        }
    );
    return docRef.id;
}

export async function editReferral(
    patientId: string,
    referralId: string,
    data: Partial<ReferralFormData>
): Promise<void> {
    const ref = doc(db, "referrals", patientId, "referrals", referralId);
    await updateDoc(ref, {
        ...data,
        lastUpdated: Timestamp.now(),
    });
}

export async function deleteReferral(
    patientId: string,
    referralId: string
): Promise<void> {
    const ref = doc(db, "referrals", patientId, "referrals", referralId);
    await updateDoc(ref, { isDeleted: true });
}
