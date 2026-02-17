
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

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
        submittedAt: data.submittedAt ? new Date().toLocaleString() : 'N/A', // Simplified for immediate send
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

export async function POST(request: Request) {
    try {
        const { formId, formData, triggerType } = await request.json();

        console.log(`API processing email for: ${formId}, Type: ${triggerType || 'initial'}`);

        // 1. Fetch Latest Settings
        let emailSettings = null;
        try {
            const settingsSnap = await getDoc(doc(db, "settings", "email_config"));
            if (settingsSnap.exists()) {
                emailSettings = settingsSnap.data();
            }
        } catch (e) {
            console.error("Error fetching settings:", e);
        }

        // Check Automation Status (unless manual retry)
        const automationEnabled = emailSettings?.automationEnabled ?? true;
        if (!automationEnabled && triggerType !== 'retry') {
            return NextResponse.json({ message: "Automation paused", status: "skipped" });
        }

        const results = { user: 'skipped', admin: 'skipped' };

        // 2. Send User Email
        if (formData.email && (triggerType === 'retry_user' || !triggerType || triggerType === 'initial')) {
            const userMail = getEmailContent('user', formData, emailSettings);
            try {
                await transporter.sendMail({
                    from: '"Health Automation" <reconditeali@gmail.com>',
                    to: formData.email,
                    subject: userMail.subject,
                    html: userMail.html
                });
                await updateDoc(doc(db, "forms", formId), {
                    userEmailStatus: 'sent',
                    userEmailSentAt: new Date(),
                    retryUserEmail: false
                });
                results.user = 'sent';
            } catch (error: any) {
                console.error("User email failed", error);
                await updateDoc(doc(db, "forms", formId), {
                    userEmailStatus: 'failed',
                    userEmailError: error.message
                });
                results.user = 'failed';
            }
        }

        // 3. Send Admin Email
        if (triggerType === 'retry_admin' || !triggerType || triggerType === 'initial') {
            const adminMail = getEmailContent('admin', formData, emailSettings);
            try {
                await transporter.sendMail({
                    from: '"Health Automation" <reconditeali@gmail.com>',
                    to: adminEmail,
                    subject: adminMail.subject,
                    html: adminMail.html
                });
                await updateDoc(doc(db, "forms", formId), {
                    adminEmailStatus: 'sent',
                    adminEmailSentAt: new Date(),
                    retryAdminEmail: false
                });
                results.admin = 'sent';
            } catch (error: any) {
                console.error("Admin email failed", error);
                await updateDoc(doc(db, "forms", formId), {
                    adminEmailStatus: 'failed',
                    adminEmailError: error.message
                });
                results.admin = 'failed';
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
