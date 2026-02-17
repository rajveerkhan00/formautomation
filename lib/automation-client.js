
// Helper function to submit data to the new API endpoint
export async function submitToAutomationApi(formId, formData) {
    try {
        const response = await fetch('/api/process-emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                formId: formId,
                formData: formData,
                triggerType: 'initial'
            }),
        });
        const result = await response.json();
        console.log('Automation API Result:', result);
        return result;
    } catch (error) {
        console.error('Error calling Automation API:', error);
        return { error: error.message };
    }
}
