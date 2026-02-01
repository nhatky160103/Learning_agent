'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Layers, Plus, Play, Trash2, Edit2, Search,
    Clock, CheckCircle, Brain, ArrowRight, Loader2,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { flashcardsApi } from '@/lib/api';
import { useStudyStore } from '@/lib/store';

interface Deck {
    id: string;
    name: string;
    description?: string;
    tags: string[];
    card_count: number;
    due_count: number;
    created_at: string;
}

interface Flashcard {
    id: string;
    question: string;
    answer: string;
    hint?: string;
    ease_factor: number;
    interval_days: number;
    review_count: number;
}

export default function FlashcardsPage() {
    const [decks, setDecks] = useState<Deck[]>([]);
    const [dueCards, setDueCards] = useState<Flashcard[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateDeck, setShowCreateDeck] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [creating, setCreating] = useState(false);

    // Review state
    const [reviewMode, setReviewMode] = useState(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [reviewingCard, setReviewingCard] = useState(false);

    const { startSession, updateSession, endSession } = useStudyStore();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [decksData, dueData] = await Promise.all([
                flashcardsApi.listDecks(),
                flashcardsApi.getDueCards(20),
            ]);
            setDecks(decksData);
            setDueCards(dueData);
        } catch (error) {
            console.error('Failed to load flashcards:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateDeck = async () => {
        if (!newDeckName.trim()) return;

        setCreating(true);
        try {
            const deck = await flashcardsApi.createDeck({ name: newDeckName });
            setDecks([...decks, deck]);
            setNewDeckName('');
            setShowCreateDeck(false);
            toast.success('Deck created!');
        } catch (error) {
            toast.error('Failed to create deck');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteDeck = async (id: string) => {
        if (!confirm('Delete this deck and all its cards?')) return;

        try {
            await flashcardsApi.deleteDeck(id);
            setDecks(decks.filter(d => d.id !== id));
            toast.success('Deck deleted');
        } catch (error) {
            toast.error('Failed to delete deck');
        }
    };

    const startReview = () => {
        if (dueCards.length === 0) {
            toast.error('No cards due for review');
            return;
        }
        setReviewMode(true);
        setCurrentCardIndex(0);
        setShowAnswer(false);
        startSession('flashcard');
    };

    const handleReview = async (quality: number) => {
        if (reviewingCard) return;

        setReviewingCard(true);
        const card = dueCards[currentCardIndex];

        try {
            await flashcardsApi.reviewCard(card.id, { quality_rating: quality });
            updateSession(1, quality >= 3 ? 1 : 0);

            if (currentCardIndex < dueCards.length - 1) {
                setCurrentCardIndex(currentCardIndex + 1);
                setShowAnswer(false);
            } else {
                // Finished review
                const session = endSession();
                toast.success(`Review complete! ${session?.correctCount}/${session?.itemsReviewed} correct`);
                setReviewMode(false);
                loadData(); // Reload to get updated due counts
            }
        } catch (error) {
            toast.error('Failed to record review');
        } finally {
            setReviewingCard(false);
        }
    };

    const filteredDecks = decks.filter(deck =>
        deck.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalDue = decks.reduce((sum, d) => sum + (d.due_count || 0), 0);
    const totalCards = decks.reduce((sum, d) => sum + (d.card_count || 0), 0);

    if (reviewMode && dueCards.length > 0) {
        const currentCard = dueCards[currentCardIndex];

        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
                {/* Progress */}
                <div className="w-full max-w-xl mb-8">
                    <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                        <span>Card {currentCardIndex + 1} of {dueCards.length}</span>
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
                            animate={{ width: `${((currentCardIndex + 1) / dueCards.length) * 100}%` }}
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Flashcards</h1>
                    <p className="text-gray-400 mt-1">
                        {totalDue > 0 ? `${totalDue} cards due for review` : 'All caught up!'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search decks..."
                            className="pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-full md:w-48"
                        />
                    </div>

                    <button
                        onClick={() => setShowCreateDeck(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        New Deck
                    </button>

                    {totalDue > 0 && (
                        <button
                            onClick={startReview}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:shadow-glow transition-shadow"
                        >
                            <Play className="w-5 h-5" />
                            Review ({totalDue})
                        </button>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-white">{decks.length}</p>
                    <p className="text-gray-400 text-sm">Decks</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-white">{totalCards}</p>
                    <p className="text-gray-400 text-sm">Total Cards</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-primary-400">{totalDue}</p>
                    <p className="text-gray-400 text-sm">Due Today</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-400">{totalCards - totalDue}</p>
                    <p className="text-gray-400 text-sm">Mastered</p>
                </div>
            </div>

            {/* Create Deck Modal */}
            <AnimatePresence>
                {showCreateDeck && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowCreateDeck(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass rounded-2xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold text-white mb-4">Create New Deck</h2>
                            <input
                                type="text"
                                value={newDeckName}
                                onChange={(e) => setNewDeckName(e.target.value)}
                                placeholder="Deck name..."
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 mb-4"
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCreateDeck(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateDeck}
                                    disabled={!newDeckName.trim() || creating}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium disabled:opacity-50"
                                >
                                    {creating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Decks Grid */}
            {loading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-40 skeleton rounded-2xl" />
                    ))}
                </div>
            ) : filteredDecks.length === 0 ? (
                <div className="text-center py-12 glass rounded-2xl">
                    <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No decks yet</h3>
                    <p className="text-gray-400 mb-4">Create your first deck or generate from documents</p>
                    <button
                        onClick={() => setShowCreateDeck(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        Create Deck
                    </button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDecks.map((deck) => (
                        <motion.div
                            key={deck.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass rounded-2xl p-6 hover-lift group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                    <Layers className="w-6 h-6 text-white" />
                                </div>
                                <button
                                    onClick={() => handleDeleteDeck(deck.id)}
                                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <h3 className="text-lg font-semibold text-white mb-1">{deck.name}</h3>
                            <p className="text-gray-400 text-sm mb-4">{deck.description || 'No description'}</p>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-sm">
                                    <span className="text-gray-400">{deck.card_count || 0} cards</span>
                                    {(deck.due_count || 0) > 0 && (
                                        <span className="text-primary-400">{deck.due_count} due</span>
                                    )}
                                </div>

                                <Link
                                    href={`/dashboard/flashcards/${deck.id}`}
                                    className="flex items-center gap-1 text-primary-400 hover:text-primary-300 text-sm font-medium"
                                >
                                    View <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
