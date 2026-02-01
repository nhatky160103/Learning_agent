import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    email: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
    total_xp: number;
    current_streak: number;
    longest_streak: number;
    daily_goal_minutes: number;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,

            login: (token: string, user: User) => {
                set({ token, user, isAuthenticated: true });
            },

            logout: () => {
                set({ token: null, user: null, isAuthenticated: false });
            },

            updateUser: (updates: Partial<User>) => {
                set((state) => ({
                    user: state.user ? { ...state.user, ...updates } : null,
                }));
            },
        }),
        {
            name: 'auth-storage',
        }
    )
);

// Study Session Store
interface StudySession {
    id?: string;
    type: 'flashcard' | 'quiz' | 'reading';
    startTime: Date;
    itemsReviewed: number;
    correctCount: number;
}

interface StudyState {
    currentSession: StudySession | null;
    startSession: (type: 'flashcard' | 'quiz' | 'reading') => void;
    updateSession: (items: number, correct: number) => void;
    endSession: () => StudySession | null;
}

export const useStudyStore = create<StudyState>((set, get) => ({
    currentSession: null,

    startSession: (type) => {
        set({
            currentSession: {
                type,
                startTime: new Date(),
                itemsReviewed: 0,
                correctCount: 0,
            },
        });
    },

    updateSession: (items, correct) => {
        set((state) => ({
            currentSession: state.currentSession
                ? {
                    ...state.currentSession,
                    itemsReviewed: state.currentSession.itemsReviewed + items,
                    correctCount: state.currentSession.correctCount + correct,
                }
                : null,
        }));
    },

    endSession: () => {
        const session = get().currentSession;
        set({ currentSession: null });
        return session;
    },
}));

// UI State Store
interface UIState {
    sidebarOpen: boolean;
    toggleSidebar: () => void;
    theme: 'dark' | 'light';
    toggleTheme: () => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            sidebarOpen: true,
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
            theme: 'dark',
            toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
        }),
        {
            name: 'ui-storage',
        }
    )
);
