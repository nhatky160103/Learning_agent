'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Plus, Edit2, Trash2, Play, Brain,
    Loader2, CheckCircle, XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { flashcardsApi } from '@/lib/api';
import { useStudyStore } from '@/lib/store';

interface Flashcard {
    id: string;
    question: string;
    answer: string;
    hint?: string;
    difficulty: string;
    ease_factor: number;
    interval_days: number;
    next_review_date: string;
}

interface Deck {
    id: string;
    name: string;
    description?: string;
    card_count: number;
    flashcards: Flashcard[];
}

export default function DeckDetailPage() {
    const params = useParams();
    const router = useRouter();
    const deckId = params.id as string;

    const [deck, setDeck] = useState<Deck | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAddCard, setShowAddCard] = useState(false);
    const [newCard, setNewCard] = useState({ question: '', answer: '', hint: '' });
    const [adding, setAdding] = useState(false);

    // Review state
    const [reviewMode, setReviewMode] = useState(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [reviewingCard, setReviewingCard] = useState(false);

    const { startSession, updateSession, endSession } = useStudyStore();

    useEffect(() => {
        loadDeck();
    }, [deckId]);

    const loadDeck = async () => {
        try {
            const data = await flashcardsApi.getDeck(deckId);
            setDeck(data);
        } catch (error) {
            console.error('Failed to load deck:', error);
            toast.error('Failed to load deck');
            router.push('/dashboard/flashcards');
        } finally {
            setLoading(false);
        }
    };

    const handleAddCard = async () => {
        if (!newCard.question.trim() || !newCard.answer.trim()) {
            toast.error('Question and answer are required');
            return;
        }

        setAdding(true);
        try {
            await flashcardsApi.createCard({
                deck_id: deckId,
                question: newCard.question,
                answer: newCard.answer,
                hint: newCard.hint || undefined,
            });
            setNewCard({ question: '', answer: '', hint: '' });
            setShowAddCard(false);
            toast.success('Card added!');
            loadDeck();
        } catch (error) {
            toast.error('Failed to add card');
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteCard = async (cardId: string) => {
        if (!confirm('Delete this card?')) return;

        try {
            await flashcardsApi.deleteCard(cardId);
            toast.success('Card deleted');
            loadDeck();
        } catch (error) {
            toast.error('Failed to delete card');
        }
    };

    const startReview = () => {
        if (!deck || deck.flashcards.length === 0) {
            toast.error('No cards to review');
            return;
        }
        setReviewMode(true);
        setCurrentCardIndex(0);
        setShowAnswer(false);
        startSession('flashcard');
    };

    const handleReview = async (quality: number) => {
        if (reviewingCard || !deck) return;

        setReviewingCard(true);
        const card = deck.flashcards[currentCardIndex];

        try {
            await flashcardsApi.reviewCard(card.id, { quality_rating: quality });
            updateSession(1, quality >= 3 ? 1 : 0);

            if (currentCardIndex < deck.flashcards.length - 1) {
                setCurrentCardIndex(currentCardIndex + 1);
                setShowAnswer(false);
            } else {
                const session = endSession();
                toast.success(`Review complete! ${session?.correctCount}/${session?.itemsReviewed} correct`);
                setReviewMode(false);
                loadDeck();
            }
        } catch (error) {
            toast.error('Failed to record review');
        } finally {
            setReviewingCard(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
        );
    }

    if (!deck) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-400">Deck not found</p>
            </div>
        );
    }

    // Review Mode
    if (reviewMode && deck.flashcards.length > 0) {
        const currentCard = deck.flashcards[currentCardIndex];

        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
                {/* Progress */}
                <div className="w-full max-w-xl mb-8">
                    <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                        <span>Card {currentCardIndex + 1} of {deck.flashcards.length}</span>
                        <button
                            onClick={() => {
                                endSession();
                                setReviewMode(false);
                            }}
                            className="text-gray-400 hover:text-white"
                        >
                            Exit Review
                        </button>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-primary-500 to-accent-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${((currentCardIndex + 1) / deck.flashcards.length) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Flashcard */}
                <div
                    className={`flip-card w-full max-w-xl aspect-[4/3] cursor-pointer ${showAnswer ? 'flipped' : ''}`}
                    onClick={() => setShowAnswer(!showAnswer)}
                >
                    <div className="flip-card-inner">
                        {/* Front */}
                        <div className="flip-card-front glass p-8 flex flex-col items-center justify-center">
                            <span className="text-xs text-gray-500 uppercase tracking-wider mb-4">Question</span>
                            <p className="text-2xl text-white text-center">{currentCard.question}</p>
                            {currentCard.hint && !showAnswer && (
                                <p className="text-gray-400 text-sm mt-4">Hint: {currentCard.hint}</p>
                            )}
                            <p className="text-gray-500 text-sm mt-6">Click to reveal answer</p>
                        </div>

                        {/* Back */}
                        <div className="flip-card-back glass p-8 flex flex-col items-center justify-center bg-gradient-to-br from-primary-900/50 to-accent-900/50">
                            <span className="text-xs text-gray-400 uppercase tracking-wider mb-4">Answer</span>
                            <p className="text-2xl text-white text-center">{currentCard.answer}</p>
                        </div>
                    </div>
                </div>

                {/* Rating Buttons */}
                <AnimatePresence>
                    {showAnswer && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="mt-8 flex items-center gap-3"
                        >
                            <p className="text-gray-400 text-sm mr-4">How well did you know this?</p>
                            {[
                                { label: 'Again', quality: 1, color: 'bg-red-500/20 text-red-400 hover:bg-red-500/30' },
                                { label: 'Hard', quality: 2, color: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' },
                                { label: 'Good', quality: 3, color: 'bg-green-500/20 text-green-400 hover:bg-green-500/30' },
                                { label: 'Easy', quality: 4, color: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' },
                            ].map((btn) => (
                                <button
                                    key={btn.quality}
                                    onClick={() => handleReview(btn.quality)}
                                    disabled={reviewingCard}
                                    className={`px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 ${btn.color}`}
                                >
                                    {reviewingCard ? <Loader2 className="w-5 h-5 animate-spin" /> : btn.label}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/dashboard/flashcards')}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{deck.name}</h1>
                        <p className="text-gray-400 mt-1">{deck.description || 'No description'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowAddCard(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        Add Card
                    </button>
                    {deck.flashcards.length > 0 && (
                        <button
                            onClick={startReview}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:shadow-glow transition-shadow"
                        >
                            <Play className="w-5 h-5" />
                            Review All
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="glass rounded-xl p-4">
                <div className="flex items-center gap-6">
                    <div>
                        <p className="text-2xl font-bold text-white">{deck.card_count}</p>
                        <p className="text-gray-400 text-sm">Total Cards</p>
                    </div>
                </div>
            </div>

            {/* Add Card Modal */}
            <AnimatePresence>
                {showAddCard && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowAddCard(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass rounded-2xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold text-white mb-4">Add New Card</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Question</label>
                                    <textarea
                                        value={newCard.question}
                                        onChange={(e) => setNewCard({ ...newCard, question: e.target.value })}
                                        placeholder="Enter question..."
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none"
                                        rows={3}
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Answer</label>
                                    <textarea
                                        value={newCard.answer}
                                        onChange={(e) => setNewCard({ ...newCard, answer: e.target.value })}
                                        placeholder="Enter answer..."
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none"
                                        rows={3}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Hint (Optional)</label>
                                    <input
                                        type="text"
                                        value={newCard.hint}
                                        onChange={(e) => setNewCard({ ...newCard, hint: e.target.value })}
                                        placeholder="Enter hint..."
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowAddCard(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddCard}
                                    disabled={!newCard.question.trim() || !newCard.answer.trim() || adding}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium disabled:opacity-50"
                                >
                                    {adding ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Add Card'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Cards List */}
            {deck.flashcards.length === 0 ? (
                <div className="text-center py-12 glass rounded-2xl">
                    <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No cards yet</h3>
                    <p className="text-gray-400 mb-4">Add your first flashcard to start learning</p>
                    <button
                        onClick={() => setShowAddCard(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        Add Card
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {deck.flashcards.map((card, index) => (
                        <motion.div
                            key={card.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="glass rounded-xl p-4 hover:bg-white/5 transition-colors group"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <p className="text-white font-medium mb-2">{card.question}</p>
                                    <p className="text-gray-400 text-sm">{card.answer}</p>
                                    {card.hint && (
                                        <p className="text-gray-500 text-xs mt-1">Hint: {card.hint}</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleDeleteCard(card.id)}
                                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
