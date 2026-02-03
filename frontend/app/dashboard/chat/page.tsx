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
    sources?: any[];
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [documents, setDocuments] = useState<any[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        loadDocuments();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadDocuments = async () => {
        try {
            const docs = await documentsApi.list();
            setDocuments(docs.filter((d: any) => d.status === 'processed' || d.status === 'ready'));
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

        // Create a placeholder for the assistant's message
        setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }]);

        abortControllerRef.current = new AbortController();

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(chatApi.getStreamUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: userMessage,
                    document_id: selectedDocId || undefined,
                    conversation_history: messages.slice(-10).map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            if (!response.body) return;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let assistantContent = '';
            let sources: any[] = [];
            // Queue for smooth typing
            const streamQueue: string[] = [];
            let isStreaming = true;

            // Start the typewriter loop
            const processQueue = async () => {
                while (isStreaming || streamQueue.length > 0) {
                    if (streamQueue.length > 0) {
                        // Take simpler approach: pull chunks and update state
                        // If queue is large, pull more to catch up
                        const takeCount = Math.max(1, Math.floor(streamQueue.length / 5));
                        const chunk = streamQueue.splice(0, takeCount).join('');

                        assistantContent += chunk;

                        setMessages(prev => {
                            const newMessages = [...prev];
                            const lastMsg = newMessages[newMessages.length - 1];
                            if (lastMsg.role === 'assistant') {
                                lastMsg.content = assistantContent;
                                lastMsg.sources = sources;
                            }
                            return newMessages;
                        });

                        // Small delay for typing effect
                        await new Promise(r => setTimeout(r, 15));
                    } else {
                        // Wait for more data
                        await new Promise(r => setTimeout(r, 50));
                    }
                }
            };

            // Start processing in background without awaiting
            const processingPromise = processQueue();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'token') {
                            // Split token into characters for smoother effect
                            // If just using token as-is, it might still look blocky if token is a whole word
                            // But usually token is fine. Let's try pushing token chars.
                            // If data.content is very long, it will be added to buffer
                            streamQueue.push(...data.content.split(''));
                        } else if (data.type === 'sources') {
                            sources = data.data;
                            // Update sources immediately
                            setMessages(prev => {
                                const newMessages = [...prev];
                                const lastMsg = newMessages[newMessages.length - 1];
                                if (lastMsg.role === 'assistant') {
                                    lastMsg.sources = sources;
                                }
                                return newMessages;
                            });
                        } else if (data.type === 'error') {
                            toast.error(data.content);
                        }
                    } catch (e) {
                        // Ignore incomplete JSON chunks from split lines
                    }
                }
            }

            isStreaming = false;
            await processingPromise;

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                toast.error('Failed to receive response');
                console.error(error);
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    // ... existing handleExplain implementation (can also be updated to stream if backend supports it, but keeping as is for now) ...

    const handleExplain = async (concept: string, level: string = 'intermediate') => {
        // Fallback to regular API for now, or implement streaming here too
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
                sources: response.sources
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
            <div className="flex flex-row items-center justify-between gap-4 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Sparkles className="w-6 h-6 text-accent-400" />
                    <h1 className="text-xl font-bold text-white">
                        AI Study Assistant
                    </h1>
                </div>

                <div className="relative">
                    <select
                        value={selectedDocId}
                        onChange={(e) => setSelectedDocId(e.target.value)}
                        className="w-full max-w-[200px] px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500 truncate appearance-none pr-8"
                        style={{ colorScheme: 'dark' }}
                    >
                        <option value="" className="bg-gray-900 text-white">All Knowledge</option>
                        {documents.map(doc => (
                            <option key={doc.id} value={doc.id} className="bg-gray-900 text-white truncate">
                                {doc.original_filename}
                            </option>
                        ))}
                    </select>
                    <BookOpen className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 glass rounded-2xl overflow-hidden flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                                        onClick={() => setInput(prompt.prompt)} // This will update input, user hits enter. Or we could auto-send.
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
                                {messages.map((message, index) => {
                                    // Skip empty assistant placeholder while loading (handled by separate loader)
                                    if (loading && message.role === 'assistant' && !message.content && index === messages.length - 1) return null;

                                    return (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`max-w-[85%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                                                {message.role === 'assistant' && (
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                                            <Brain className="w-4 h-4 text-white" />
                                                        </div>
                                                        <span className="text-sm text-gray-400">AI Assistant</span>
                                                    </div>
                                                )}

                                                <div className={`rounded-2xl px-6 py-5 ${message.role === 'user'
                                                    ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/10'
                                                    : 'bg-white/5 text-gray-200 border border-white/5'
                                                    }`}>
                                                    <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10">
                                                        {/* We can use a Markdown renderer here later, for now whitespace-pre-wrap */}
                                                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                                                    </div>

                                                    {/* Sources display */}
                                                    {message.sources && message.sources.length > 0 && (
                                                        <div className="mt-4 pt-4 border-t border-white/10">
                                                            <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                                                                <BookOpen className="w-3 h-3" />
                                                                Sources
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {message.sources.map((source: any, i: number) => (
                                                                    <span key={i} className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-400 border border-white/5">
                                                                        {source.title || `Document ${i + 1}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {message.role === 'assistant' && (
                                                    <div className="flex items-center gap-2 mt-2 ml-1">
                                                        <button
                                                            onClick={() => copyToClipboard(message.content)}
                                                            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                                                            title="Copy text"
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </button>
                                                        <button className="p-1.5 rounded-lg text-gray-500 hover:text-green-400 hover:bg-green-500/10 transition-colors">
                                                            <ThumbsUp className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>

                            {/* Loading state - only when waiting for first token if content is empty, or keep "Thinking" generic */}
                            {loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-start gap-3"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                        <Brain className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="bg-white/5 rounded-2xl px-5 py-4 flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                                        <span className="text-gray-400 animate-pulse">Thinking...</span>
                                    </div>
                                </motion.div>
                            )}

                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-white/10 relative z-10 bg-gray-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-3 max-w-4xl mx-auto w-full">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                placeholder="Ask anything about your study materials..."
                                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 pr-12 transition-all focus:ring-1 focus:ring-primary-500/50"
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim() || loading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                            >
                                {loading && messages[messages.length - 1]?.content ? <span className="w-5 h-5 block border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <Send className="w-5 h-5" />}
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                setMessages([]);
                                if (abortControllerRef.current) abortControllerRef.current.abort();
                            }}
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
