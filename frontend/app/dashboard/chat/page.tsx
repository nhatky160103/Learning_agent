'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Send, Loader2, Sparkles, Copy, ThumbsUp,
    MessageCircle, FileText, Lightbulb, BookOpen, RefreshCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { chatApi, documentsApi } from '@/lib/api';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    suggested_actions?: any[];
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [documents, setDocuments] = useState<any[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadDocuments();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadDocuments = async () => {
        try {
            const docs = await documentsApi.list();
            setDocuments(docs.filter((d: any) => d.status === 'processed'));
        } catch (error) {
            console.error('Failed to load documents:', error);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const response = await chatApi.sendMessage({
                message: userMessage,
                document_id: selectedDocId || undefined,
                conversation_history: messages.slice(-10).map(m => ({
                    role: m.role,
                    content: m.content,
                })),
            });

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.response,
                suggested_actions: response.suggested_actions,
            }]);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to send message');
            setMessages(prev => prev.slice(0, -1)); // Remove user message on error
        } finally {
            setLoading(false);
        }
    };

    const handleExplain = async (concept: string, level: string = 'intermediate') => {
        setLoading(true);
        setMessages(prev => [...prev, { role: 'user', content: `Explain: ${concept} (${level} level)` }]);

        try {
            const response = await chatApi.explainConcept({
                concept,
                level,
                document_id: selectedDocId || undefined,
            });

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.explanation,
            }]);
        } catch (error: any) {
            toast.error('Failed to get explanation');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const quickPrompts = [
        { icon: Lightbulb, label: 'Summarize my notes', prompt: 'Can you summarize the key concepts from my documents?' },
        { icon: Brain, label: 'Explain a concept', prompt: 'Explain the most important concept in simple terms.' },
        { icon: BookOpen, label: 'Study tips', prompt: 'What are the best strategies to master this material?' },
        { icon: FileText, label: 'Key takeaways', prompt: 'What are the main takeaways I should remember?' },
    ];

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Sparkles className="w-8 h-8 text-accent-400" />
                        AI Study Assistant
                    </h1>
                    <p className="text-gray-400 mt-1">Ask questions, get explanations, and master concepts</p>
                </div>

                <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-500"
                >
                    <option value="">All Knowledge</option>
                    {documents.map(doc => (
                        <option key={doc.id} value={doc.id}>{doc.original_filename}</option>
                    ))}
                </select>
            </div>

            {/* Chat Area */}
            <div className="flex-1 glass rounded-2xl overflow-hidden flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mb-6">
                                <Brain className="w-10 h-10 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">How can I help you learn today?</h2>
                            <p className="text-gray-400 mb-8 max-w-md">
                                Ask questions about your study materials, request explanations, or get study tips.
                            </p>

                            <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                                {quickPrompts.map((prompt, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setInput(prompt.prompt)}
                                        className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                                    >
                                        <prompt.icon className="w-5 h-5 text-primary-400" />
                                        <span className="text-sm text-gray-300">{prompt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            <AnimatePresence>
                                {messages.map((message, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-[80%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                                            {message.role === 'assistant' && (
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                                        <Brain className="w-4 h-4 text-white" />
                                                    </div>
                                                    <span className="text-sm text-gray-400">AI Assistant</span>
                                                </div>
                                            )}

                                            <div className={`rounded-2xl px-5 py-4 ${message.role === 'user'
                                                    ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white'
                                                    : 'bg-white/5 text-gray-200'
                                                }`}>
                                                <p className="whitespace-pre-wrap">{message.content}</p>
                                            </div>

                                            {message.role === 'assistant' && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <button
                                                        onClick={() => copyToClipboard(message.content)}
                                                        className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                    <button className="p-2 rounded-lg text-gray-500 hover:text-green-400 hover:bg-green-500/10">
                                                        <ThumbsUp className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Suggested Actions */}
                                            {message.suggested_actions && message.suggested_actions.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {message.suggested_actions.map((action: any, i: number) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => setInput(action.prompt || action.action)}
                                                            className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-400 text-sm hover:bg-primary-500/30 transition-colors"
                                                        >
                                                            {action.action || action.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {loading && (
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                        <Brain className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="bg-white/5 rounded-2xl px-5 py-4">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-primary-400" />
                                            <span className="text-gray-400">Thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                placeholder="Ask anything about your study materials..."
                                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 pr-12"
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || loading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 text-white disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                        </div>

                        <button
                            onClick={() => setMessages([])}
                            className="p-4 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="New conversation"
                        >
                            <RefreshCcw className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
