import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, query, orderBy, limit, doc, updateDoc } from "firebase/firestore";
import nodemailer from "nodemailer";

const firebaseConfig = {
    apiKey: "AIzaSyDg7OY_4DbI2Irh6zmez4lWfafa12OlrBc",
    authDomain: "formsdata-a63b0.firebaseapp.com",
    projectId: "formsdata-a63b0",
    storageBucket: "formsdata-a63b0.firebasestorage.app",
    messagingSenderId: "167954523375",
    appId: "1:167954523375:web:7ec58360b08c61401aa71a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Email Configuration (You must update this)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'reconditeali@gmail.com', // Update this
        pass: 'vozi tmhv hkre fwxl'     // Update this
    }
});

const adminEmail = "reconditeali@gmail.com";

// Email Template Management
let emailSettings = null;
let automationEnabled = true; // Default to true

// Listen for template changes
onSnapshot(doc(db, "settings", "email_config"), (docSnap) => {
    if (docSnap.exists()) {
        console.log("Settings updated from database.");
        emailSettings = docSnap.data();
        // Check for automation flag (default to true if undefined)
        if (emailSettings.automationEnabled !== undefined) {
            automationEnabled = emailSettings.automationEnabled;
            console.log("Automation Status:", automationEnabled ? "ENABLED" : "DISABLED");
        }
    } else {
        console.log("No custom settings found. Using defaults.");
    }
});

const fillTemplate = (template, data) => {
    if (!template) return "";
    return template.replace(/\$\{([\w]+)\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : '';
    });
};

const getEmailContent = (type, data) => {
    // 1. Prepare Data (Format dates, arrays, etc. for simple string replacement)
    const viewModel = {
        ...data,
        submittedAt: data.submittedAt ? new Date(data.submittedAt.seconds * 1000).toLocaleString() : 'N/A',
        primaryGoals: data.primaryGoals ? data.primaryGoals.join(', ') : '',
        healthConcerns: data.healthConcerns ? data.healthConcerns.join(', ') : '',
        // Ensure all potential fields exist to avoid 'undefined' in email
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

    // 2. Choose Template
    if (type === 'user') {
        if (emailSettings && emailSettings.userSubject && emailSettings.userHtml) {
            return {
                subject: fillTemplate(emailSettings.userSubject, viewModel),
                html: fillTemplate(emailSettings.userHtml, viewModel)
            };
        }
        // Default User Template
        return {
            subject: `Consultation Confirmed: ${viewModel.firstName} ${viewModel.lastName}`,
            html: `
            <h2>Hello ${viewModel.firstName},</h2>
            <p>Thank you for submitting your consultation request.</p>
            <p>Here are the details we received:</p>
            <ul>
                <li><strong>Name:</strong> ${viewModel.firstName} ${viewModel.lastName}</li>
                <li><strong>Consultation Type:</strong> ${viewModel.consultationType}</li>
                <li><strong>Preferred Time:</strong> ${viewModel.preferredTime}</li>
            </ul>
            <p>We will contact you shortly at ${viewModel.phone} or via this email.</p>
            <br>
            <p>Best Regards,<br>Your Health Team</p>
            `
        };
    }

    if (type === 'admin') {
        if (emailSettings && emailSettings.adminSubject && emailSettings.adminHtml) {
            return {
                subject: fillTemplate(emailSettings.adminSubject, viewModel),
                html: fillTemplate(emailSettings.adminHtml, viewModel)
            };
        }
        // Default Admin Template
        return {
            subject: `New Form Submission: ${viewModel.firstName} ${viewModel.lastName}`,
            html: `
            <h2>New Submission Received</h2>
            <p><strong>Submitted At:</strong> ${viewModel.submittedAt}</p>
            
            <h3>User Identity</h3>
            <ul>
                <li>Name: ${viewModel.firstName} ${viewModel.lastName}</li>
                <li>Email: ${viewModel.email}</li>
                <li>Phone: ${viewModel.countryCode} ${viewModel.phone}</li>
            </ul>

            <h3>Health Metrics</h3>
            <ul>
                <li>Height: ${viewModel.height} ${viewModel.heightUnit}</li>
                <li>Weight: ${viewModel.weight} ${viewModel.weightUnit}</li>
                <li>BMI: ${viewModel.bmi} (${viewModel.bmiStatus})</li>
            </ul>

            <h3>Medical Details</h3>
            <ul>
                <li>Goals: ${viewModel.primaryGoals}</li>
                <li>Concerns: ${viewModel.healthConcerns}</li>
                <li>Weight Loss Attempts: ${viewModel.weightLossAttempts}</li>
            </ul>

            <h3>Preferences</h3>
            <ul>
                <li>Type: ${viewModel.consultationType}</li>
                <li>Time: ${viewModel.preferredTime}</li>
            </ul>
            `
        };
    }
};

// Listener
console.log("Starting Firebase Listener for new forms...");

const q = query(collection(db, "forms"));

// We only want to process NEW additions, not initial load.
// However, onSnapshot with includeMetadataChanges:true might be complex.
// A common pattern is to check timestamp > startup time, but simpler is to handle 'added' events.
// Note: on initial load, 'added' is fired for existing docs. We should filter those out if desired, 
// OR just run this service continuously. 
// To avoid spamming old users on restart, we can use a "processed" flag in DB or check timestamp.
// For now, I'll add a timestamp check (processed after script start).

const startTime = new Date();

onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const docId = change.doc.id;

        if (change.type === "added") {
            // 1. Process NEW forms
            // We verify it's actually new (or at least not processed yet)
            // A simple check is: does it have a status field?
            const alreadyProcessed = data.userEmailStatus || data.adminEmailStatus;

            // Also check timestamp to prevent reading entire DB history on restart if status is missing
            // If submittedAt is a Firestore Timestamp
            const submittedAt = data.submittedAt ? new Date(data.submittedAt.seconds * 1000) : new Date();
            const isRecent = submittedAt > startTime;

            // Decision Matrix:
            // If it has status -> Processed, ignore.
            // If it has No status AND isRecent -> Process.
            // If it has No status AND isOld -> Ignore (don't spam old data on restart).

            if (!alreadyProcessed && isRecent) {
                if (automationEnabled) {
                    console.log("New form detected, processing:", docId);
                    handleNewForm(docId, data);
                } else {
                    console.log("New form detected but Automation is DISABLED. Skipping:", docId);
                }
            }
        }

        if (change.type === "modified") {
            // 2. Process RETRIES
            // Check for retry flags
            if (data.retryUserEmail === true) {
                console.log("Retry Triggered: User Email for", docId);
                sendUserEmail(docId, data);
            }
            if (data.retryAdminEmail === true) {
                console.log("Retry Triggered: Admin Email for", docId);
                sendAdminEmail(docId, data);
            }
        }
    });
});

// Separated Send Functions for granular control/retries
async function sendUserEmail(docId, data) {
    if (!data.email) return;

    // Clear retry flag first (to prevent infinite loops if we error out midway, though Firestore write is atomic)
    // Actually best to set status 'sending' first? Or just do it at end.
    // Let's reset the flag immediately so we don't re-trigger.
    await updateDoc(doc(db, "forms", docId), { retryUserEmail: false, userEmailStatus: 'sending' }).catch(e => console.error("Error updating doc", e));

    const userMail = getEmailContent('user', data);
    try {
        await transporter.sendMail({
            from: '"Health Automation" <reconditeali@gmail.com>',
            to: data.email,
            subject: userMail.subject,
            html: userMail.html
        });
        console.log(`Confirmation email sent to ${data.email}`);
        await updateDoc(doc(db, "forms", docId), {
            userEmailStatus: 'sent',
            userEmailSentAt: new Date()
        });
    } catch (error) {
        console.error("Error sending user email:", error);
        await updateDoc(doc(db, "forms", docId), {
            userEmailStatus: 'failed',
            userEmailError: error.message
        });
    }
}

async function sendAdminEmail(docId, data) {
    // Clear flag
    await updateDoc(doc(db, "forms", docId), { retryAdminEmail: false, adminEmailStatus: 'sending' }).catch(e => console.error("Error updating doc", e));

    const adminMail = getEmailContent('admin', data);
    try {
        await transporter.sendMail({
            from: '"Health Automation" <reconditeali@gmail.com>',
            to: adminEmail,
            subject: adminMail.subject,
            html: adminMail.html
        });
        console.log(`Admin email sent to ${adminEmail}`);
        await updateDoc(doc(db, "forms", docId), {
            adminEmailStatus: 'sent',
            adminEmailSentAt: new Date()
        });
    } catch (error) {
        console.error("Error sending admin email:", error);
        await updateDoc(doc(db, "forms", docId), {
            adminEmailStatus: 'failed',
            adminEmailError: error.message
        });
    }
}

async function handleNewForm(docId, data) {
    // Wrapper to call both
    await sendUserEmail(docId, data);
    await sendAdminEmail(docId, data);
}
