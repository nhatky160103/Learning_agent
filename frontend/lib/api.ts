import axios, { AxiosError, AxiosResponse } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
        if (error.response?.status === 401) {
            if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authApi = {
    register: async (data: { email: string; username: string; password: string; full_name?: string }) => {
        const response = await api.post('/auth/register', data);
        return response.data;
    },
    login: async (email: string, password: string) => {
        const response = await api.post('/auth/login/json', { email, password });
        return response.data;
    },
    getMe: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },
    updateProfile: async (data: any) => {
        const response = await api.put('/auth/me', data);
        return response.data;
    },
};

// Documents API
export const documentsApi = {
    upload: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/documents/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },
    list: async () => {
        const response = await api.get('/documents');
        return response.data;
    },
    get: async (id: string) => {
        const response = await api.get(`/documents/${id}`);
        return response.data;
    },
    getContent: async (id: string) => {
        const response = await api.get(`/documents/${id}/content`);
        return response.data;
    },
    delete: async (id: string) => {
        const response = await api.delete(`/documents/${id}`);
        return response.data;
    },
};

// Flashcards API
export const flashcardsApi = {
    // Decks
    createDeck: async (data: { name: string; description?: string; tags?: string[] }) => {
        const response = await api.post('/flashcards/decks', data);
        return response.data;
    },
    listDecks: async () => {
        const response = await api.get('/flashcards/decks');
        return response.data;
    },
    getDeck: async (id: string) => {
        const response = await api.get(`/flashcards/decks/${id}`);
        return response.data;
    },
    updateDeck: async (id: string, data: any) => {
        const response = await api.put(`/flashcards/decks/${id}`, data);
        return response.data;
    },
    deleteDeck: async (id: string) => {
        const response = await api.delete(`/flashcards/decks/${id}`);
        return response.data;
    },

    // Cards
    createCard: async (data: { deck_id: string; question: string; answer: string; hint?: string }) => {
        const response = await api.post('/flashcards/cards', data);
        return response.data;
    },
    updateCard: async (id: string, data: any) => {
        const response = await api.put(`/flashcards/cards/${id}`, data);
        return response.data;
    },
    deleteCard: async (id: string) => {
        const response = await api.delete(`/flashcards/cards/${id}`);
        return response.data;
    },

    // Reviews
    getDueCards: async (limit?: number, deckId?: string) => {
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit.toString());
        if (deckId) params.append('deck_id', deckId);
        const response = await api.get(`/flashcards/due?${params}`);
        return response.data;
    },
    reviewCard: async (cardId: string, data: { quality_rating: number; time_spent_seconds?: number }) => {
        const response = await api.post(`/flashcards/cards/${cardId}/review`, data);
        return response.data;
    },

    // Generate
    generateFlashcards: async (data: { document_id: string; deck_name: string; count?: number }) => {
        const response = await api.post('/flashcards/generate', data);
        return response.data;
    },

    // Stats
    getStats: async () => {
        const response = await api.get('/flashcards/stats');
        return response.data;
    },
};

// Quizzes API
export const quizzesApi = {
    generate: async (data: {
        document_id?: string;
        deck_id?: string;
        title: string;
        question_count?: number;
        question_types?: string[];
        difficulty?: string;
    }) => {
        const response = await api.post('/quizzes/generate', data);
        return response.data;
    },
    list: async () => {
        const response = await api.get('/quizzes');
        return response.data;
    },
    get: async (id: string) => {
        const response = await api.get(`/quizzes/${id}`);
        return response.data;
    },
    start: async (id: string) => {
        const response = await api.post(`/quizzes/${id}/start`);
        return response.data;
    },
    submit: async (id: string, data: { answers: Array<{ question_id: string; user_answer: string }>; time_taken_seconds: number }) => {
        const response = await api.post(`/quizzes/${id}/submit`, data);
        return response.data;
    },
    getAttempts: async (id: string) => {
        const response = await api.get(`/quizzes/${id}/attempts`);
        return response.data;
    },
    delete: async (id: string) => {
        const response = await api.delete(`/quizzes/${id}`);
        return response.data;
    },
};

// Progress API
export const progressApi = {
    getDashboard: async () => {
        const response = await api.get('/progress/dashboard');
        return response.data;
    },
    createSession: async (data: {
        session_type: string;
        duration_minutes: number;
        items_reviewed: number;
        accuracy?: number;
    }) => {
        const response = await api.post('/progress/sessions', data);
        return response.data;
    },
    getRecommendations: async () => {
        const response = await api.get('/progress/recommendations');
        return response.data;
    },
    getHeatmap: async (days?: number) => {
        const params = days ? `?days=${days}` : '';
        const response = await api.get(`/progress/heatmap${params}`);
        return response.data;
    },
};

// Chat API
export const chatApi = {
    sendMessage: async (data: { message: string; document_id?: string; conversation_history?: any[] }) => {
        const response = await api.post('/chat/message', data);
        return response.data;
    },
    explainConcept: async (data: { concept: string; level?: string; document_id?: string }) => {
        const response = await api.post('/chat/explain', data);
        return response.data;
    },
    summarize: async (text: string) => {
        const response = await api.post('/chat/summarize', null, { params: { text } });
        return response.data;
    },
};

export default api;
