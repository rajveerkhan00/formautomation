"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, DocumentData, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import styles from "./styles.module.css";
import {
    Users,
    Settings,
    Mail,
    Phone,
    Ruler,
    Weight,
    Activity,
    Calendar,
    Clock,
    CheckCircle,
    Video,
    MapPin,
    AlertCircle,
    RotateCcw,
    Save,
    ChevronDown,
    XCircle,
    Send,
    PlayCircle,
    StopCircle,
    ChevronUp,
    FileText
} from 'lucide-react';

interface FormData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    countryCode: string;
    height: string;
    heightUnit: string;
    weight: string;
    weightUnit: string;
    bmi: string;
    bmiStatus: string;
    primaryGoals: string[];
    healthConcerns: string[];
    weightLossAttempts: string;
    consultationType: string;
    preferredTime: string;
    submittedAt: any; // Timestamp
    userEmailStatus?: 'sent' | 'failed' | 'sending';
    adminEmailStatus?: 'sent' | 'failed' | 'sending';
    userEmailSentAt?: any;
    adminEmailSentAt?: any;
}

interface EmailSettings {
    userSubject: string;
    userHtml: string;
    adminSubject: string;
    adminHtml: string;
    automationEnabled: boolean;
}

const DEFAULT_SETTINGS: EmailSettings = {
    automationEnabled: true,
    userSubject: "Consultation Confirmed: ${firstName} ${lastName}",
    userHtml: `<h2>Hello \${firstName},</h2>
<p>Thank you for submitting your consultation request.</p>
<p>Here are the details we received:</p>
<ul>
<li><strong>Name:</strong> \${firstName} \${lastName}</li>
<li><strong>Consultation Type:</strong> \${consultationType}</li>
<li><strong>Preferred Time:</strong> \${preferredTime}</li>
</ul>
<p>We will contact you shortly at \${phone} or via this email.</p>
<br>
<p>Best Regards,<br>Your Health Team</p>`,
    adminSubject: "New Form Submission: ${firstName} ${lastName}",
    adminHtml: `<h2>New Submission Received</h2>
<p><strong>Submitted At:</strong> \${submittedAt}</p>
<h3>User Identity</h3>
<ul>
<li>Name: \${firstName} \${lastName}</li>
<li>Email: \${email}</li>
<li>Phone: \${countryCode} \${phone}</li>
</ul>
<h3>Health Metrics</h3>
<ul>
<li>Height: \${height} \${heightUnit}</li>
<li>Weight: \${weight} \${weightUnit}</li>
<li>BMI: \${bmi} (\${bmiStatus})</li>
</ul>
<h3>Medical Details</h3>
<ul>
<li>Goals: \${primaryGoals}</li>
<li>Concerns: \${healthConcerns}</li>
<li>Weight Loss Attempts: \${weightLossAttempts}</li>
</ul>
<h3>Preferences</h3>
<ul>
<li>Type: \${consultationType}</li>
<li>Time: \${preferredTime}</li>
</ul>`
};

export default function Dashboard() {
    const [forms, setForms] = useState<FormData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Email Settings State
    const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS);
    const [showSettings, setShowSettings] = useState(false);
    const [showForms, setShowForms] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    // Toast Timer
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => {
        // Real-time listener
        const q = query(collection(db, "forms"), orderBy("submittedAt", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const formsData: FormData[] = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as FormData[];
            setForms(formsData);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching forms:", err);
            setError("Failed to load forms. Please check your connection or permissions.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Fetch Settings separately (single fetch is fine, or listener if we want sync)
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, "settings", "email_config");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSettings(docSnap.data() as EmailSettings);
                }
            } catch (e) {
                console.error("Error loading settings", e);
            }
        };
        fetchSettings();
    }, []);

    const saveSettings = async () => {
        setSavingSettings(true);
        try {
            await setDoc(doc(db, "settings", "email_config"), settings);
            setToast({ message: "Email settings saved successfully!", type: 'success' });
        } catch (e) {
            console.error("Error saving settings", e);
            setToast({ message: "Failed to save settings.", type: 'error' });
        } finally {
            setSavingSettings(false);
        }
    };

    const toggleAutomation = async () => {
        const newState = !settings.automationEnabled;
        setSettings({ ...settings, automationEnabled: newState }); // Optimistic update
        try {
            await setDoc(doc(db, "settings", "email_config"), { ...settings, automationEnabled: newState });
            setToast({
                message: `Automation ${newState ? 'Enabled' : 'Disabled'}`,
                type: newState ? 'success' : 'info'
            });
        } catch (e) {
            console.error("Error toggling automation", e);
            setToast({ message: "Failed to update automation status", type: 'error' });
            setSettings({ ...settings, automationEnabled: !newState }); // Revert
        }
    };

    const retryEmail = async (formId: string, type: 'user' | 'admin') => {
        try {
            // Optimistic UI update
            await updateDoc(doc(db, "forms", formId), {
                [type === 'user' ? 'userEmailStatus' : 'adminEmailStatus']: 'sending'
            });
            setToast({ message: `Retrying ${type} email...`, type: 'info' });

            // Call API
            const formData = forms.find(f => f.id === formId);
            if (!formData) return;

            const res = await fetch('/api/process-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    formId,
                    formData,
                    triggerType: type === 'user' ? 'retry_user' : 'retry_admin'
                })
            });

            const result = await res.json();
            if (result.success) {
                setToast({ message: `${type} email sent successfully!`, type: 'success' });
            } else {
                setToast({ message: `Failed to send ${type} email via API.`, type: 'error' });
            }

        } catch (e) {
            console.error(e);
            setToast({ message: "Failed to trigger retry", type: 'error' });
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return "N/A";
        // Check if it's a Firestore Timestamp
        if (timestamp.seconds) {
            return new Date(timestamp.seconds * 1000).toLocaleString();
        }
        return new Date(timestamp).toLocaleString();
    };

    const getBmiClass = (status: string) => {
        if (!status) return "";
        const s = status.toLowerCase();
        if (s.includes("normal")) return styles.bmiNormal;
        if (s.includes("overweight")) return styles.bmiOverweight;
        if (s.includes("obese")) return styles.bmiObese;
        return styles.bmiUnderweight;
    };

    if (loading) return <div className={styles.dashboardContainer}><h2 className={styles.title}>Loading Dashboard...</h2></div>;
    if (error) return <div className={styles.dashboardContainer}><h2 className={styles.title}>Error: {error}</h2></div>;

    return (
        <div className={styles.dashboardContainer}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.titleGroup}>
                    <h1 className={styles.title}>Consultation Requests</h1>
                    <p className={styles.subtitle}>Real-time overview of incoming health consultation forms.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button
                        className={`${styles.settingsButton} ${settings.automationEnabled ? styles.automationOn : styles.automationOff}`}
                        onClick={toggleAutomation}
                        title={settings.automationEnabled ? "Click to Pause Automation" : "Click to Start Automation"}
                    >
                        {settings.automationEnabled ? <StopCircle size={18} /> : <PlayCircle size={18} />}
                        {settings.automationEnabled ? "Automation ON" : "Automation PAUSED"}
                    </button>
                    <button
                        className={styles.settingsButton}
                        onClick={() => setShowForms(!showForms)}
                    >
                        <FileText className={styles.icon} size={18} />
                        {showForms ? "Hide Forms" : "View Forms"}
                        {showForms ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                        className={styles.settingsButton}
                        onClick={() => setShowSettings(!showSettings)}
                    >
                        <Settings className={styles.icon} size={18} />
                        {showSettings ? "Hide Config" : "Config"}
                        {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>
            </header>

            {/* Toast Notification */}
            {toast && (
                <div className={styles.toastContainer}>
                    <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : toast.type === 'error' ? styles.toastError : styles.toastInfo}`}>
                        <div className={styles.toastIcon}>
                            {toast.type === 'success' ? <CheckCircle className={styles.icon} color="#10b981" /> :
                                toast.type === 'error' ? <AlertCircle className={styles.icon} color="#ef4444" /> :
                                    <Activity className={styles.icon} />}
                        </div>
                        <div className={styles.toastContent}>
                            <div className={styles.toastTitle}>{toast.type === 'success' ? 'Success' : toast.type === 'error' ? 'Error' : 'Info'}</div>
                            <div className={styles.toastMessage}>{toast.message}</div>
                        </div>
                    </div>
                </div>
            )}

            {showSettings && (
                <div className={styles.settingsContainer}>
                    <div className={styles.settingsHeader}>
                        <h2 className={styles.sectionTitle} style={{ fontSize: '1.25rem', color: '#1f2937' }}>
                            <Mail className={styles.icon} style={{ marginRight: '0.5rem' }} />
                            Email Configuration
                        </h2>
                    </div>

                    <div className={styles.settingsGrid}>
                        <div className={styles.settingCard}>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>User Confirmation Subject</label>
                                <input
                                    className={styles.input}
                                    value={settings.userSubject}
                                    onChange={(e) => setSettings({ ...settings, userSubject: e.target.value })}
                                    placeholder="Enter email subject"
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>
                                    User HTML Body
                                    <small style={{ fontWeight: 400, color: '#6b7280' }}>Variables: {'${firstName}'}, {'${email}'}</small>
                                </label>
                                <textarea
                                    className={styles.textarea}
                                    value={settings.userHtml}
                                    onChange={(e) => setSettings({ ...settings, userHtml: e.target.value })}
                                    placeholder="<html>...</html>"
                                />
                            </div>
                        </div>

                        <div className={styles.settingCard}>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Admin Notification Subject</label>
                                <input
                                    className={styles.input}
                                    value={settings.adminSubject}
                                    onChange={(e) => setSettings({ ...settings, adminSubject: e.target.value })}
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Admin HTML Body</label>
                                <textarea
                                    className={styles.textarea}
                                    value={settings.adminHtml}
                                    onChange={(e) => setSettings({ ...settings, adminHtml: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <div className={styles.buttonGroup}>
                        <button
                            className={styles.resetButton}
                            onClick={() => {
                                if (confirm("Are you sure you want to reset to the default templates?")) {
                                    setSettings(DEFAULT_SETTINGS);
                                    setToast({ message: "Reset to default templates.", type: 'info' });
                                }
                            }}
                            disabled={savingSettings}
                        >
                            <RotateCcw size={16} /> Reset Defaults
                        </button>
                        <button
                            className={styles.saveButton}
                            onClick={saveSettings}
                            disabled={savingSettings}
                        >
                            {savingSettings ? <Activity className="animate-spin" /> : <Save size={18} />}
                            {savingSettings ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            )}

            {showForms && (
                <div className={styles.grid}>
                    {forms.map((form) => (
                        <div key={form.id} className={styles.card}>
                            <div className={styles.cardHeader}>
                                <span className={styles.name}>{form.firstName} {form.lastName}</span>
                                <span className={`${styles.badge} ${form.consultationType === 'virtual' ? styles.badgeVirtual : styles.badgeInPerson}`}>
                                    {form.consultationType === 'virtual' ? <Video size={12} style={{ marginRight: 4 }} /> : <MapPin size={12} style={{ marginRight: 4 }} />}
                                    {form.consultationType}
                                </span>
                            </div>

                            <div className={styles.section}>
                                <div className={styles.sectionTitle}><Users size={14} /> Contact Info</div>
                                <div className={styles.dataRow}>
                                    <Mail size={14} strokeWidth={2.5} className="text-gray-400" />
                                    <span className={styles.value}>{form.email}</span>
                                </div>
                                <div className={styles.dataRow}>
                                    <Phone size={14} strokeWidth={2.5} className="text-gray-400" />
                                    <span className={styles.value}>{form.countryCode} {form.phone}</span>
                                </div>
                            </div>

                            <div className={styles.section}>
                                <div className={styles.sectionTitle}><Activity size={14} /> Biometrics</div>
                                <div className={styles.dataRow}>
                                    <Ruler size={14} strokeWidth={2.5} className="text-gray-400" />
                                    <span className={styles.value}>{form.height} {form.heightUnit}</span>
                                    <span style={{ color: '#e5e7eb' }}>|</span>
                                    <Weight size={14} strokeWidth={2.5} className="text-gray-400" />
                                    <span className={styles.value}>{form.weight} {form.weightUnit}</span>
                                </div>
                                <div className={styles.dataRow}>
                                    <span className={styles.value} style={{ display: 'flex', alignItems: 'center' }}>
                                        <span className={`${styles.bmiCreate} ${getBmiClass(form.bmiStatus)}`}></span>
                                        BMI: {form.bmi} <span style={{ fontSize: '0.8em', color: '#6b7280', marginLeft: '4px' }}>({form.bmiStatus})</span>
                                    </span>
                                </div>
                            </div>

                            <div className={styles.section}>
                                <div className={styles.sectionTitle}><CheckCircle size={14} /> Goals & Concerns</div>
                                <div className={styles.tags}>
                                    {form.primaryGoals?.map((g, i) => <span key={i} className={styles.tag}>{g}</span>)}
                                    {form.healthConcerns?.map((c, i) => <span key={i} className={`${styles.tag} ${styles.concernTag}`}>{c}</span>)}
                                </div>
                            </div>

                            <div className={styles.emailStatusSection}>
                                <div className={styles.sectionTitle}><Mail size={14} /> Email Status</div>
                                <div className={styles.statusRow}>
                                    <div className={styles.statusLabel}>User:</div>
                                    <div className={styles.statusValue}>
                                        {form.userEmailStatus === 'sent' && <span className={styles.statusSuccess}><CheckCircle size={14} /> Sent</span>}
                                        {form.userEmailStatus === 'failed' && <span className={styles.statusError}><XCircle size={14} /> Failed</span>}
                                        {(!form.userEmailStatus || form.userEmailStatus === 'sending') && <span className={styles.statusPending}><Activity size={14} className="animate-spin" /> Pending</span>}
                                    </div>
                                    <button className={styles.retryButton} onClick={() => retryEmail(form.id, 'user')} title="Retry Sending">
                                        <Send size={14} /> Retry
                                    </button>
                                </div>
                                <div className={styles.statusRow}>
                                    <div className={styles.statusLabel}>Admin:</div>
                                    <div className={styles.statusValue}>
                                        {form.adminEmailStatus === 'sent' && <span className={styles.statusSuccess}><CheckCircle size={14} /> Sent</span>}
                                        {form.adminEmailStatus === 'failed' && <span className={styles.statusError}><XCircle size={14} /> Failed</span>}
                                        {(!form.adminEmailStatus || form.adminEmailStatus === 'sending') && <span className={styles.statusPending}><Activity size={14} className="animate-spin" /> Pending</span>}
                                    </div>
                                    <button className={styles.retryButton} onClick={() => retryEmail(form.id, 'admin')} title="Retry Sending">
                                        <Send size={14} /> Retry
                                    </button>
                                </div>
                            </div>

                            <div className={styles.timestamp}>
                                <Clock size={12} />
                                Submitted: {formatDate(form.submittedAt)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
