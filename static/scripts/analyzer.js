document.addEventListener('DOMContentLoaded', () => {
    const resultsContainer = document.getElementById('results-container');
    const errorContainer = document.getElementById('error-container');
    const questionInput = document.getElementById('question-input');
    const loadingDiv = document.getElementById('loading');
    const noQuery = document.getElementById('no-query');
    const form = document.getElementById('query-form');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = questionInput.value.trim();
        questionInput.value = '';
        if (!question) return;

        // Reset UI
        resultsContainer.classList.add('hidden');
        errorContainer.classList.add('hidden');
        loadingDiv.classList.remove('hidden');
        loadingDiv.style.display = 'flex';
        noQuery.classList.add('hidden');

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    question: question
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'An unknown error occurred.');
            }

            const data = await response.json();
            displayResponse(data);            

        } catch (error) {
            displayError(error.message);
        } finally {
            loadingDiv.classList.add('hidden');
            loadingDiv.style.display = 'none';
        }
    });

    function displayResponse(data) {
        document.getElementById('knowledge-results').textContent = JSON.stringify(data.dbResults, null, 2);
        document.getElementById('generated-cypher').textContent = data.generatedCypher;
        document.getElementById('query-response').innerHTML = data.reasoningResponse;
        document.getElementById('user-question').textContent = data.userQuestion;
        resultsContainer.classList.remove('hidden');
    }

    function displayError(msg) {
        document.getElementById('error-message').textContent = msg;
        errorContainer.classList.remove('hidden');
    }
});