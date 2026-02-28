'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Send, Sparkles, Copy, ThumbsUp,
    Lightbulb, BookOpen, FileText, RefreshCcw, StopCircle,
    CircleDot
} from 'lucide-react';
import toast from 'react-hot-toast';
import { chatApi, documentsApi } from '@/lib/api';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    suggested_actions?: any[];
    sources?: any[];
    isStreaming?: boolean;
}

type SendState = 'idle' | 'thinking' | 'streaming';

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sendState, setSendState] = useState<SendState>('idle');
    const [documents, setDocuments] = useState<any[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // ─── Dùng ref để tránh stale closure ────────────────────────────────────
    const messagesRef = useRef<Message[]>([]);
    const sendStateRef = useRef<SendState>('idle');
    const selectedDocIdRef = useRef<string>('');
    const inputRef2 = useRef<string>('');

    // Sync state → ref mỗi khi thay đổi
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { sendStateRef.current = sendState; }, [sendState]);
    useEffect(() => { selectedDocIdRef.current = selectedDocId; }, [selectedDocId]);
    useEffect(() => { inputRef2.current = input; }, [input]);

    useEffect(() => {
        loadDocuments();
        return () => abortControllerRef.current?.abort();
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

    // ─── stopGeneration không cần deps ───────────────────────────────────────
    const stopGeneration = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setSendState('idle');
        sendStateRef.current = 'idle';
        setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
                last.isStreaming = false;
                if (!last.content) last.content = '_(Stopped)_';
            }
            return next;
        });
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    // ─── sendMessage đọc từ ref thay vì closure ──────────────────────────────
    const sendMessage = useCallback(async () => {
        // Nếu đang generate → stop (check TRƯỚC khi check input rỗng,
        // vì input đã bị xóa sau lần gửi đầu tiên)
        if (sendStateRef.current !== 'idle') {
            stopGeneration();
            return;
        }

        const userMessage = inputRef2.current.trim();
        if (!userMessage) return;

        // Reset input ngay lập tức
        setInput('');
        inputRef2.current = '';
        setSendState('thinking');
        sendStateRef.current = 'thinking';

        // Lấy history từ ref (luôn fresh)
        const currentMessages = messagesRef.current;

        // Append user message + assistant placeholder
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: '', isStreaming: true, sources: [] }
        ]);

        abortControllerRef.current = new AbortController();

        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            const response = await fetch(chatApi.getStreamUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: userMessage,
                    document_id: selectedDocIdRef.current || undefined,
                    // Dùng currentMessages (snapshot trước khi append) để gửi history đúng
                    conversation_history: currentMessages.slice(-10).map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                const statusMessages: Record<number, string> = {
                    429: '⏳ API quota exceeded. Please wait a moment and try again.',
                    401: '🔑 Session expired. Please log in again.',
                    403: '🔒 Access denied.',
                    500: '🔧 Server error. Please try again shortly.',
                    502: '🔧 AI service unavailable. Please try again shortly.',
                    503: '🔧 Service temporarily down. Please try again shortly.',
                };
                throw new Error(statusMessages[response.status] || `Server error (${response.status}). Please try again.`);
            }
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let assistantContent = '';
            let sources: any[] = [];
            const streamQueue: string[] = [];
            let isReading = true;
            let firstToken = true;

            // Typewriter loop chạy song song
            const processQueue = async () => {
                while (isReading || streamQueue.length > 0) {
                    if (streamQueue.length > 0) {
                        const takeCount = Math.max(1, Math.floor(streamQueue.length / 3));
                        assistantContent += streamQueue.splice(0, takeCount).join('');

                        setMessages(prev => {
                            const next = [...prev];
                            const last = next[next.length - 1];
                            if (last?.role === 'assistant') {
                                last.content = assistantContent;
                                last.sources = sources;
                                last.isStreaming = true;
                            }
                            return next;
                        });
                        await new Promise(r => setTimeout(r, 12));
                    } else {
                        await new Promise(r => setTimeout(r, 30));
                    }
                }
            };

            const processingPromise = processQueue();

            // Đọc stream
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                for (const line of chunk.split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.type === 'token') {
                            if (firstToken) {
                                setSendState('streaming');
                                sendStateRef.current = 'streaming';
                                firstToken = false;
                            }
                            streamQueue.push(...data.content.split(''));
                        } else if (data.type === 'sources') {
                            sources = data.data;
                            setMessages(prev => {
                                const next = [...prev];
                                const last = next[next.length - 1];
                                if (last?.role === 'assistant') last.sources = sources;
                                return next;
                            });
                        } else if (data.type === 'error') {
                            toast.error(data.content);
                        }
                    } catch {
                        // JSON parse lỗi = chunk chưa đầy đủ, bỏ qua
                    }
                }
            }

            isReading = false;
            await processingPromise;

            // Hoàn thành
            setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') last.isStreaming = false;
                return next;
            });

        } catch (error: any) {
            if (error.name === 'AbortError') {
                // User tự stop → đã xử lý trong stopGeneration
                return;
            }
            console.error('Chat error:', error);
            toast.error(error.message || 'Something went wrong. Please try again.');
            // Xóa placeholder rỗng nếu chưa có content
            setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant' && !last.content) next.pop();
                return next;
            });
        } finally {
            setSendState('idle');
            sendStateRef.current = 'idle';
            abortControllerRef.current = null;
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [stopGeneration]); // Chỉ depend vào stopGeneration, mọi state đọc qua ref

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied!');
    };

    const quickPrompts = [
        { icon: Lightbulb, label: 'Summarize my notes', prompt: 'Can you summarize the key concepts from my documents?' },
        { icon: Brain, label: 'Explain a concept', prompt: 'Explain the most important concept in simple terms.' },
        { icon: BookOpen, label: 'Study tips', prompt: 'What are the best strategies to master this material?' },
        { icon: FileText, label: 'Key takeaways', prompt: 'What are the main takeaways I should remember?' },
    ];

    const isGenerating = sendState !== 'idle';

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">
            {/* Header */}
            <div className="flex flex-row items-center justify-between gap-4 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Sparkles className="w-6 h-6 text-accent-400" />
                    <h1 className="text-xl font-bold text-white">Study Assistant</h1>
                </div>

                <div className="flex items-center gap-3">
                    <AnimatePresence>
                        {sendState === 'thinking' && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20"
                            >
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                                </span>
                                <span className="text-xs text-yellow-300 font-medium">Thinking...</span>
                            </motion.div>
                        )}
                        {sendState === 'streaming' && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20"
                            >
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-400"></span>
                                </span>
                                <span className="text-xs text-primary-300 font-medium">Responding...</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="relative">
                        <select
                            value={selectedDocId}
                            onChange={(e) => {
                                setSelectedDocId(e.target.value);
                                selectedDocIdRef.current = e.target.value;
                            }}
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
                                        onClick={() => {
                                            setInput(prompt.prompt);
                                            inputRef2.current = prompt.prompt;
                                            inputRef.current?.focus();
                                        }}
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
                            <AnimatePresence initial={false}>
                                {messages.map((message, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className="max-w-[85%]">
                                            {message.role === 'assistant' && (
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                                                        <Brain className="w-4 h-4 text-white" />
                                                    </div>
                                                    <span className="text-sm text-gray-400">AI Assistant</span>
                                                    {message.isStreaming && (
                                                        <span className="text-xs text-primary-400 animate-pulse">● writing</span>
                                                    )}
                                                </div>
                                            )}

                                            <div className={`rounded-2xl px-6 py-5 ${message.role === 'user'
                                                ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/10'
                                                : 'bg-white/5 text-gray-200 border border-white/5'
                                                }`}>
                                                {message.role === 'assistant' && !message.content && message.isStreaming ? (
                                                    <div className="flex items-center gap-3 py-1">
                                                        <div className="flex gap-1">
                                                            {[0, 1, 2].map(i => (
                                                                <motion.span
                                                                    key={i}
                                                                    className="w-2 h-2 rounded-full bg-primary-400"
                                                                    animate={{ y: [0, -6, 0] }}
                                                                    transition={{
                                                                        duration: 0.8,
                                                                        repeat: Infinity,
                                                                        delay: i * 0.15,
                                                                        ease: 'easeInOut'
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
                                                        <span className="text-gray-400 text-sm">Thinking...</span>
                                                    </div>
                                                ) : (
                                                    <p className="whitespace-pre-wrap leading-relaxed">
                                                        {message.content}
                                                        {message.isStreaming && (
                                                            <motion.span
                                                                className="inline-block w-0.5 h-4 bg-primary-400 ml-0.5 align-middle"
                                                                animate={{ opacity: [1, 0, 1] }}
                                                                transition={{ duration: 0.8, repeat: Infinity }}
                                                            />
                                                        )}
                                                    </p>
                                                )}

                                                {message.sources && message.sources.length > 0 && !message.isStreaming && (
                                                    <div className="mt-4 pt-4 border-t border-white/10">
                                                        <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                                                            <BookOpen className="w-3 h-3" /> Sources
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {message.sources.map((source: any, i: number) => (
                                                                <span key={i} className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-400 border border-white/5 flex items-center gap-1">
                                                                    <span className="text-primary-400 font-mono">[{source.citation_number || i + 1}]</span>
                                                                    {source.document_title || source.title || `Document ${i + 1}`}
                                                                    {source.relevance_score && (
                                                                        <span className="text-gray-600 ml-1">{Math.round(source.relevance_score * 100)}%</span>
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {message.role === 'assistant' && !message.isStreaming && message.content && (
                                                <div className="flex items-center gap-2 mt-2 ml-1">
                                                    <button
                                                        onClick={() => copyToClipboard(message.content)}
                                                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                                                        title="Copy"
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
                                ))}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-white/10 bg-gray-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-3 max-w-4xl mx-auto w-full">
                        <div className="flex-1 relative flex items-center">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => {
                                    setInput(e.target.value);
                                    inputRef2.current = e.target.value;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                placeholder={isGenerating ? "Type your next message..." : "Ask anything about your study materials..."}
                                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 pr-14 transition-all focus:ring-1 focus:ring-primary-500/50"
                            />

                            {/* Send / Stop button — absolute inside input wrapper */}
                            <motion.button
                                onClick={sendMessage}
                                disabled={sendState === 'idle' && !input.trim()}
                                whileTap={{ scale: 0.9 }}
                                title={isGenerating ? 'Stop generation' : 'Send message'}
                                className={`absolute right-3 p-2.5 rounded-lg transition-all ${isGenerating
                                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                                    : input.trim()
                                        ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:opacity-90 shadow-lg shadow-primary-500/20'
                                        : 'bg-white/5 text-gray-600 cursor-not-allowed'
                                    }`}
                            >
                                <AnimatePresence mode="wait">
                                    {sendState === 'thinking' ? (
                                        <motion.div
                                            key="thinking"
                                            initial={{ scale: 0, rotate: -90 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            exit={{ scale: 0, rotate: 90 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            <motion.div
                                                animate={{ scale: [1, 1.15, 1] }}
                                                transition={{ duration: 1, repeat: Infinity }}
                                            >
                                                <CircleDot className="w-5 h-5" />
                                            </motion.div>
                                        </motion.div>
                                    ) : sendState === 'streaming' ? (
                                        <motion.div
                                            key="streaming"
                                            initial={{ scale: 0, rotate: -90 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            exit={{ scale: 0, rotate: 90 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            <StopCircle className="w-5 h-5" />
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="send"
                                            initial={{ scale: 0, rotate: 90 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            exit={{ scale: 0, rotate: -90 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            <Send className="w-5 h-5" />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.button>
                        </div>

                        {/* New conversation */}
                        <button
                            onClick={() => {
                                stopGeneration();
                                setMessages([]);
                                messagesRef.current = [];
                            }}
                            className="p-4 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="New conversation"
                        >
                            <RefreshCcw className="w-5 h-5" />
                        </button>
                    </div>

                    <AnimatePresence>
                        {isGenerating && (
                            <motion.p
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 4 }}
                                className="text-center text-xs text-gray-600 mt-2"
                            >
                                Click <span className="text-red-400">Stop</span> to interrupt generation
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
