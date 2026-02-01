'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, FileText, File, Trash2, Eye, Loader2,
    CheckCircle, Clock, AlertCircle, Search, Plus,
    Layers, Brain
} from 'lucide-react';
import toast from 'react-hot-toast';
import { documentsApi, flashcardsApi } from '@/lib/api';

interface Document {
    id: string;
    filename: string;
    original_filename: string;
    file_type: string;
    file_size: number;
    status: string;
    summary?: string;
    created_at: string;
}

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [generatingFlashcards, setGeneratingFlashcards] = useState<string | null>(null);

    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        try {
            const data = await documentsApi.list();
            setDocuments(data);
        } catch (error) {
            console.error('Failed to load documents:', error);
            toast.error('Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        setUploading(true);

        for (const file of acceptedFiles) {
            try {
                await documentsApi.upload(file);
                toast.success(`Uploaded ${file.name}`);
            } catch (error: any) {
                toast.error(`Failed to upload ${file.name}`);
            }
        }

        await loadDocuments();
        setUploading(false);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'text/plain': ['.txt'],
            'text/markdown': ['.md'],
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
        },
        multiple: true,
    });

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this document?')) return;

        try {
            await documentsApi.delete(id);
            setDocuments(docs => docs.filter(d => d.id !== id));
            toast.success('Document deleted');
        } catch (error) {
            toast.error('Failed to delete document');
        }
    };

    const handleGenerateFlashcards = async (doc: Document) => {
        setGeneratingFlashcards(doc.id);
        try {
            const result = await flashcardsApi.generateFlashcards({
                document_id: doc.id,
                deck_name: `${doc.original_filename} Flashcards`,
                count: 10,
            });
            toast.success(`Generated ${result.cards?.length || 0} flashcards!`);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to generate flashcards');
        } finally {
            setGeneratingFlashcards(null);
        }
    };

    const filteredDocs = documents.filter(doc =>
        doc.original_filename?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'processed':
                return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'processing':
                return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
            case 'failed':
                return <AlertCircle className="w-4 h-4 text-red-400" />;
            default:
                return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };

    const getFileIcon = (type: string) => {
        if (type.includes('pdf')) return '📄';
        if (type.includes('word') || type.includes('doc')) return '📝';
        if (type.includes('presentation') || type.includes('ppt')) return '📊';
        if (type.includes('text') || type.includes('markdown')) return '📃';
        return '📁';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Documents</h1>
                    <p className="text-gray-400 mt-1">Upload and manage your study materials</p>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search documents..."
                        className="pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-full md:w-64"
                    />
                </div>
            </div>

            {/* Upload Zone */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                {...getRootProps()}
                className={`glass rounded-2xl p-8 border-2 border-dashed transition-colors cursor-pointer ${isDragActive ? 'border-primary-500 bg-primary-500/10' : 'border-white/20 hover:border-white/40'
                    }`}
            >
                <input {...getInputProps()} />
                <div className="text-center">
                    {uploading ? (
                        <Loader2 className="w-12 h-12 text-primary-400 mx-auto mb-4 animate-spin" />
                    ) : (
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    )}
                    <p className="text-white text-lg font-medium mb-2">
                        {isDragActive ? 'Drop files here...' : 'Drag & drop files here'}
                    </p>
                    <p className="text-gray-400 text-sm">
                        or click to browse • Supports PDF, DOCX, TXT, MD, PPTX
                    </p>
                </div>
            </motion.div>

            {/* Documents List */}
            {loading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-48 skeleton rounded-2xl" />
                    ))}
                </div>
            ) : filteredDocs.length === 0 ? (
                <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No documents yet</h3>
                    <p className="text-gray-400">Upload your first document to get started</p>
                </div>
            ) : (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                    <AnimatePresence>
                        {filteredDocs.map((doc) => (
                            <motion.div
                                key={doc.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="glass rounded-2xl p-6 hover-lift group"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <span className="text-4xl">{getFileIcon(doc.file_type)}</span>
                                    <div className="flex items-center gap-1">
                                        {getStatusIcon(doc.status)}
                                        <span className="text-xs text-gray-400 capitalize">{doc.status}</span>
                                    </div>
                                </div>

                                <h3 className="text-white font-semibold mb-2 truncate" title={doc.original_filename}>
                                    {doc.original_filename}
                                </h3>

                                <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                                    {doc.summary || 'Processing...'}
                                </p>

                                <div className="flex items-center justify-between text-sm text-gray-500">
                                    <span>{formatFileSize(doc.file_size)}</span>
                                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                                </div>

                                {/* Actions */}
                                <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleGenerateFlashcards(doc)}
                                        disabled={(doc.status !== 'ready' && doc.status !== 'processed') || generatingFlashcards === doc.id}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                    >
                                        {generatingFlashcards === doc.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Layers className="w-4 h-4" />
                                        )}
                                        Generate Cards
                                    </button>
                                    <button
                                        onClick={() => handleDelete(doc.id)}
                                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            )}
        </div>
    );
}
