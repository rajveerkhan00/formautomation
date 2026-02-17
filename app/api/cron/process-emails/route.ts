import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

// Initialize Firebase (Server-Side)
const firebaseConfig = {
    apiKey: "AIzaSyDg7OY_4DbI2Irh6zmez4lWfafa12OlrBc",
    authDomain: "formsdata-a63b0.firebaseapp.com",
    projectId: "formsdata-a63b0",
    storageBucket: "formsdata-a63b0.firebasestorage.app",
    messagingSenderId: "167954523375",
    appId: "1:167954523375:web:7ec58360b08c61401aa71a"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'reconditeali@gmail.com',
        pass: 'vozi tmhv hkre fwxl'
    }
});

const adminEmail = "reconditeali@gmail.com";

// Helper to fill templates
const fillTemplate = (template: string, data: any) => {
    if (!template) return "";
    return template.replace(/\$\{([\w]+)\}/g, (_match, key) => {
        return data[key] !== undefined ? data[key] : '';
    });
};

const getEmailContent = (type: 'user' | 'admin', data: any, settings: any) => {
    const viewModel = {
        ...data,
        submittedAt: data.submittedAt && data.submittedAt.seconds ? new Date(data.submittedAt.seconds * 1000).toLocaleString() : new Date().toLocaleString(),
        primaryGoals: Array.isArray(data.primaryGoals) ? data.primaryGoals.join(', ') : data.primaryGoals || '',
        healthConcerns: Array.isArray(data.healthConcerns) ? data.healthConcerns.join(', ') : data.healthConcerns || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        phone: data.phone || '',
        countryCode: data.countryCode || '',
        height: data.height || '',
        heightUnit: data.heightUnit || '',
        weight: data.weight || '',
        weightUnit: data.weightUnit || '',
        bmi: data.bmi || '',
        bmiStatus: data.bmiStatus || '',
        weightLossAttempts: data.weightLossAttempts || '',
        consultationType: data.consultationType || '',
        preferredTime: data.preferredTime || ''
    };

    if (type === 'user') {
        if (settings && settings.userSubject && settings.userHtml) {
            return {
                subject: fillTemplate(settings.userSubject, viewModel),
                html: fillTemplate(settings.userHtml, viewModel)
            };
        }
        // Fallback Default
        return {
            subject: `Consultation Confirmed: ${viewModel.firstName} ${viewModel.lastName}`,
            html: `<h2>Hello ${viewModel.firstName},</h2><p>Thank you for your request.</p>`
        };
    }

    if (type === 'admin') {
        if (settings && settings.adminSubject && settings.adminHtml) {
            return {
                subject: fillTemplate(settings.adminSubject, viewModel),
                html: fillTemplate(settings.adminHtml, viewModel)
            };
        }
        // Fallback Default
        return {
            subject: `New Form Submission: ${viewModel.firstName} ${viewModel.lastName}`,
            html: `<h2>New Submission</h2><p>Name: ${viewModel.firstName}</p>`
        };
    }
    return { subject: '', html: '' };
};

export async function GET(request: Request) {
    try {
        console.log("Cron started: Checking for unprocessed emails...");

        // 1. Fetch Settings
        let emailSettings = null;
        try {
            const settingsSnap = await getDoc(doc(db, "settings", "email_config"));
            if (settingsSnap.exists()) {
                emailSettings = settingsSnap.data();
            }
        } catch (e) {
            console.error("Error fetching settings:", e);
        }

        const automationEnabled = emailSettings?.automationEnabled ?? true;
        if (!automationEnabled) {
            return NextResponse.json({ message: "Automation explicitly paused via dashboard.", status: "skipped" });
        }

        // 2. Fetch Recent Forms (e.g., last 50)
        const formsRef = collection(db, "forms");
        const q = query(formsRef, orderBy("submittedAt", "desc"), limit(50));
        const querySnapshot = await getDocs(q);

        const formsToProcess: any[] = [];
        querySnapshot.forEach((formDoc) => {
            const data = formDoc.data();
            // Check if processed - Treat 'Pending'/'pending' as unprocessed
            const uStatus = data.userEmailStatus;
            const aStatus = data.adminEmailStatus;

            const needsUserEmail = !uStatus || uStatus === 'Pending' || uStatus === 'pending' || uStatus === 'retry';
            const needsAdminEmail = !aStatus || aStatus === 'Pending' || aStatus === 'pending' || aStatus === 'retry';

            if (needsUserEmail || needsAdminEmail) {
                formsToProcess.push({ id: formDoc.id, ...data });
            }
        });

        console.log(`Found ${formsToProcess.length} unprocessed forms.`);

        const results = { userProcessed: 0, adminProcessed: 0, errors: 0 };

        for (const form of formsToProcess) {
            const formId = form.id;

            // Send User Email if needed
            const uStatus = form.userEmailStatus;
            if ((!uStatus || uStatus === 'Pending' || uStatus === 'pending' || uStatus === 'retry') && form.email) {
                // Mark as sending to prevent double-send on next cron if this takes long
                await updateDoc(doc(db, "forms", formId), { userEmailStatus: 'sending' });

                const userMail = getEmailContent('user', form, emailSettings);
                try {
                    await transporter.sendMail({
                        from: '"Health Automation" <reconditeali@gmail.com>',
                        to: form.email,
                        subject: userMail.subject,
                        html: userMail.html
                    });
                    await updateDoc(doc(db, "forms", formId), {
                        userEmailStatus: 'sent',
                        userEmailSentAt: new Date()
                    });
                    results.userProcessed++;
                } catch (error: any) {
                    console.error(`User email failed for ${formId}`, error);
                    await updateDoc(doc(db, "forms", formId), {
                        userEmailStatus: 'failed',
                        userEmailError: error.message
                    });
                    results.errors++;
                }
            }

            // Send Admin Email if needed
            const aStatus = form.adminEmailStatus;
            if (!aStatus || aStatus === 'Pending' || aStatus === 'pending' || aStatus === 'retry') {
                // Mark as sending
                await updateDoc(doc(db, "forms", formId), { adminEmailStatus: 'sending' });

                const adminMail = getEmailContent('admin', form, emailSettings);
                try {
                    await transporter.sendMail({
                        from: '"Health Automation" <reconditeali@gmail.com>',
                        to: adminEmail,
                        subject: adminMail.subject,
                        html: adminMail.html
                    });
                    await updateDoc(doc(db, "forms", formId), {
                        adminEmailStatus: 'sent',
                        adminEmailSentAt: new Date()
                    });
                    results.adminProcessed++;
                } catch (error: any) {
                    console.error(`Admin email failed for ${formId}`, error);
                    await updateDoc(doc(db, "forms", formId), {
                        adminEmailStatus: 'failed',
                        adminEmailError: error.message
                    });
                    results.errors++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${results.userProcessed} user emails and ${results.adminProcessed} admin emails. Errors: ${results.errors}`,
            meta: {
                totalChecked: querySnapshot.size,
                foundUnprocessed: formsToProcess.length
            }
        });

    } catch (error: any) {
        console.error("Cron Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
