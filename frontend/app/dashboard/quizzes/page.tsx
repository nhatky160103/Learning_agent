'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Trophy, Plus, Play, FileText, Layers, Clock,
    CheckCircle, XCircle, Search, Loader2, ArrowRight,
    Target, Star, BarChart2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { quizzesApi, documentsApi, flashcardsApi } from '@/lib/api';

interface Quiz {
    id: string;
    title: string;
    description?: string;
    question_count: number;
    difficulty: string;
    attempts: number;
    best_score?: number;
    created_at: string;
}

interface QuizQuestion {
    id: string;
    question_type: string;
    question: string;
    options?: string[];
    correct_answer: string;
    explanation?: string;
}

export default function QuizzesPage() {
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);
    const [decks, setDecks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showGenerate, setShowGenerate] = useState(false);
    const [generating, setGenerating] = useState(false);

    // Quiz taking state
    const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [quizResult, setQuizResult] = useState<any>(null);
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Generate form
    const [generateForm, setGenerateForm] = useState({
        source: 'document',
        sourceId: '',
        title: '',
        questionCount: 5,
        difficulty: 'medium',
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [quizzesData, docsData, decksData] = await Promise.all([
                quizzesApi.list(),
                documentsApi.list(),
                flashcardsApi.listDecks(),
            ]);
            setQuizzes(quizzesData);
            setDocuments(docsData.filter((d: any) => d.status === 'processed'));
            setDecks(decksData);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (!generateForm.sourceId || !generateForm.title) {
            toast.error('Please select a source and enter a title');
            return;
        }

        setGenerating(true);
        try {
            const payload: any = {
                title: generateForm.title,
                question_count: generateForm.questionCount,
                difficulty: generateForm.difficulty,
            };

            if (generateForm.source === 'document') {
                payload.document_id = generateForm.sourceId;
            } else {
                payload.deck_id = generateForm.sourceId;
            }

            const quiz = await quizzesApi.generate(payload);
            setQuizzes([quiz, ...quizzes]);
            setShowGenerate(false);
            setGenerateForm({ source: 'document', sourceId: '', title: '', questionCount: 5, difficulty: 'medium' });
            toast.success('Quiz generated!');
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to generate quiz');
        } finally {
            setGenerating(false);
        }
    };

    const startQuiz = async (quiz: Quiz) => {
        try {
            const data = await quizzesApi.start(quiz.id);
            setActiveQuiz(quiz);
            setQuizQuestions(data.questions);
            setCurrentQuestion(0);
            setAnswers({});
            setQuizResult(null);
            setStartTime(new Date());
        } catch (error) {
            toast.error('Failed to start quiz');
        }
    };

    const submitQuiz = async () => {
        if (!activeQuiz || !startTime) return;

        setSubmitting(true);
        const timeTaken = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);

        try {
            const result = await quizzesApi.submit(activeQuiz.id, {
                answers: Object.entries(answers).map(([qId, answer]) => ({
                    question_id: qId,
                    user_answer: answer,
                })),
                time_taken_seconds: timeTaken,
            });
            setQuizResult(result);
        } catch (error) {
            toast.error('Failed to submit quiz');
        } finally {
            setSubmitting(false);
        }
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty.toLowerCase()) {
            case 'easy': return 'text-green-400 bg-green-500/20';
            case 'medium': return 'text-yellow-400 bg-yellow-500/20';
            case 'hard': return 'text-red-400 bg-red-500/20';
            default: return 'text-gray-400 bg-gray-500/20';
        }
    };

    const filteredQuizzes = quizzes.filter(quiz =>
        quiz.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Quiz Result Screen
    if (quizResult) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center px-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass rounded-2xl p-8 w-full max-w-lg text-center"
                >
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-6">
                        <Trophy className="w-10 h-10 text-white" />
                    </div>

                    <h2 className="text-3xl font-bold text-white mb-2">Quiz Complete!</h2>
                    <p className="text-gray-400 mb-6">{activeQuiz?.title}</p>

                    <div className="text-6xl font-bold gradient-text mb-4">
                        {quizResult.score}%
                    </div>

                    <div className="flex items-center justify-center gap-6 mb-8">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-green-400">{quizResult.correct_count}</p>
                            <p className="text-gray-400 text-sm">Correct</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-red-400">{quizResult.total_questions - quizResult.correct_count}</p>
                            <p className="text-gray-400 text-sm">Wrong</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-primary-400">+{quizResult.xp_earned || 0}</p>
                            <p className="text-gray-400 text-sm">XP</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                setActiveQuiz(null);
                                setQuizResult(null);
                                loadData();
                            }}
                            className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20"
                        >
                            Back to Quizzes
                        </button>
                        <button
                            onClick={() => startQuiz(activeQuiz!)}
                            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium"
                        >
                            Try Again
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    // Active Quiz Screen
    if (activeQuiz && quizQuestions.length > 0) {
        const question = quizQuestions[currentQuestion];
        const selectedAnswer = answers[question.id];

        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
                {/* Progress */}
                <div className="w-full max-w-2xl mb-8">
                    <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                        <span>{activeQuiz.title}</span>
                        <span>Question {currentQuestion + 1} of {quizQuestions.length}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-primary-500 to-accent-500"
                            animate={{ width: `${((currentQuestion + 1) / quizQuestions.length) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Question Card */}
                <motion.div
                    key={question.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="glass rounded-2xl p-8 w-full max-w-2xl"
                >
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-4 ${question.question_type === 'multiple_choice' ? 'bg-blue-500/20 text-blue-400' :
                            question.question_type === 'true_false' ? 'bg-purple-500/20 text-purple-400' :
                                'bg-orange-500/20 text-orange-400'
                        }`}>
                        {question.question_type.replace('_', ' ')}
                    </span>

                    <h3 className="text-xl font-semibold text-white mb-6">{question.question}</h3>

                    {/* Options */}
                    <div className="space-y-3">
                        {question.options?.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => setAnswers({ ...answers, [question.id]: option })}
                                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${selectedAnswer === option
                                        ? 'border-primary-500 bg-primary-500/20 text-white'
                                        : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/30'
                                    }`}
                            >
                                {option}
                            </button>
                        )) || (
                                // For fill-in-the-blank
                                <input
                                    type="text"
                                    value={selectedAnswer || ''}
                                    onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                                    placeholder="Type your answer..."
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                                />
                            )}
                    </div>
                </motion.div>

                {/* Navigation */}
                <div className="flex items-center gap-4 mt-8">
                    <button
                        onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                        disabled={currentQuestion === 0}
                        className="px-6 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 disabled:opacity-50"
                    >
                        Previous
                    </button>

                    {currentQuestion < quizQuestions.length - 1 ? (
                        <button
                            onClick={() => setCurrentQuestion(currentQuestion + 1)}
                            disabled={!selectedAnswer}
                            className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium disabled:opacity-50"
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            onClick={submitQuiz}
                            disabled={Object.keys(answers).length !== quizQuestions.length || submitting}
                            className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium disabled:opacity-50"
                        >
                            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Quiz'}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Quizzes</h1>
                    <p className="text-gray-400 mt-1">Test your knowledge with AI-generated quizzes</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search quizzes..."
                            className="pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-full md:w-48"
                        />
                    </div>

                    <button
                        onClick={() => setShowGenerate(true)}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:shadow-glow transition-shadow"
                    >
                        <Plus className="w-5 h-5" />
                        Generate Quiz
                    </button>
                </div>
            </div>

            {/* Generate Modal */}
            <AnimatePresence>
                {showGenerate && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowGenerate(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass rounded-2xl p-6 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold text-white mb-4">Generate Quiz</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Quiz Title</label>
                                    <input
                                        type="text"
                                        value={generateForm.title}
                                        onChange={(e) => setGenerateForm({ ...generateForm, title: e.target.value })}
                                        placeholder="E.g., Chapter 5 Quiz"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Source Type</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setGenerateForm({ ...generateForm, source: 'document', sourceId: '' })}
                                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border ${generateForm.source === 'document' ? 'border-primary-500 bg-primary-500/20' : 'border-white/10'
                                                }`}
                                        >
                                            <FileText className="w-4 h-4" />
                                            Document
                                        </button>
                                        <button
                                            onClick={() => setGenerateForm({ ...generateForm, source: 'deck', sourceId: '' })}
                                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border ${generateForm.source === 'deck' ? 'border-primary-500 bg-primary-500/20' : 'border-white/10'
                                                }`}
                                        >
                                            <Layers className="w-4 h-4" />
                                            Deck
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Select {generateForm.source === 'document' ? 'Document' : 'Deck'}
                                    </label>
                                    <select
                                        value={generateForm.sourceId}
                                        onChange={(e) => setGenerateForm({ ...generateForm, sourceId: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-500"
                                    >
                                        <option value="">Select...</option>
                                        {(generateForm.source === 'document' ? documents : decks).map((item: any) => (
                                            <option key={item.id} value={item.id}>
                                                {item.original_filename || item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Questions</label>
                                        <select
                                            value={generateForm.questionCount}
                                            onChange={(e) => setGenerateForm({ ...generateForm, questionCount: Number(e.target.value) })}
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-500"
                                        >
                                            {[5, 10, 15, 20].map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Difficulty</label>
                                        <select
                                            value={generateForm.difficulty}
                                            onChange={(e) => setGenerateForm({ ...generateForm, difficulty: e.target.value })}
                                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-500"
                                        >
                                            <option value="easy">Easy</option>
                                            <option value="medium">Medium</option>
                                            <option value="hard">Hard</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowGenerate(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={generating || !generateForm.sourceId || !generateForm.title}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium disabled:opacity-50"
                                >
                                    {generating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Generate'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quizzes Grid */}
            {loading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-48 skeleton rounded-2xl" />
                    ))}
                </div>
            ) : filteredQuizzes.length === 0 ? (
                <div className="text-center py-12 glass rounded-2xl">
                    <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No quizzes yet</h3>
                    <p className="text-gray-400 mb-4">Generate your first quiz from documents or flashcard decks</p>
                    <button
                        onClick={() => setShowGenerate(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        Generate Quiz
                    </button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredQuizzes.map((quiz) => (
                        <motion.div
                            key={quiz.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass rounded-2xl p-6 hover-lift group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                                    <Trophy className="w-6 h-6 text-white" />
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDifficultyColor(quiz.difficulty)}`}>
                                    {quiz.difficulty}
                                </span>
                            </div>

                            <h3 className="text-lg font-semibold text-white mb-2">{quiz.title}</h3>

                            <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                                <span>{quiz.question_count} questions</span>
                                <span>{quiz.attempts || 0} attempts</span>
                            </div>

                            {quiz.best_score !== undefined && (
                                <div className="flex items-center gap-2 mb-4">
                                    <Star className="w-4 h-4 text-yellow-400" />
                                    <span className="text-yellow-400 font-medium">Best: {quiz.best_score}%</span>
                                </div>
                            )}

                            <button
                                onClick={() => startQuiz(quiz)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:shadow-glow transition-shadow"
                            >
                                <Play className="w-4 h-4" />
                                Start Quiz
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
