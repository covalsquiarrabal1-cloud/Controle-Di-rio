'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Plus, Trash2, Edit2, Download, PieChart, Calendar, Wallet, Check, X, FileText, Table, Loader2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseExpenseFromVoice, ParsedExpense } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Types
interface Expense extends ParsedExpense {
  id: string;
}

export default function VozFinance() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ParsedExpense | null>(null);

  // Load from Supabase on mount
  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (e) {
      console.error("Failed to load expenses from Supabase", e);
      // Fallback to localStorage if Supabase fails
      const saved = localStorage.getItem('vozfinance_expenses');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setExpenses(parsed);
        } catch (err) {
          console.error("Failed to load expenses from localStorage", err);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Sync to localStorage as secondary backup
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('vozfinance_expenses', JSON.stringify(expenses));
    }
  }, [expenses, isLoading]);

  // Speech Recognition Setup
  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Seu navegador não suporta reconhecimento de voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      setTranscript('');
    };

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      handleVoiceInput(text);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const handleVoiceInput = async (text: string) => {
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      alert("Configuração incompleta: A chave da API do Gemini (NEXT_PUBLIC_GEMINI_API_KEY) não foi encontrada nos segredos do projeto.");
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    const parsed = await parseExpenseFromVoice(text);
    if (parsed) {
      try {
        if (!supabase) {
          throw new Error("Supabase client not initialized");
        }
        const { data, error } = await supabase
          .from('expenses')
          .insert([parsed])
          .select();

        if (error) throw error;
        if (data) {
          setExpenses(prev => [data[0], ...prev]);
        }
      } catch (e) {
        console.error("Failed to save to Supabase", e);
        const newExpense: Expense = {
          ...parsed,
          id: crypto.randomUUID(),
        };
        setExpenses(prev => [newExpense, ...prev]);
      }
    } else {
      alert("Não consegui entender a despesa. Tente falar algo como: 'Almoço 45 reais hoje'");
    }
    setIsProcessing(false);
  };

  // Actions
  const deleteExpense = async (id: string) => {
    try {
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      console.error("Failed to delete from Supabase", e);
      setExpenses(prev => prev.filter(e => e.id !== id));
    }
  };

  const startEditing = (expense: Expense) => {
    setEditingId(expense.id);
    setEditForm({ ...expense });
  };

  const saveEdit = async () => {
    if (editingId && editForm) {
      try {
        if (!supabase) {
          throw new Error("Supabase client not initialized");
        }
        const { error } = await supabase
          .from('expenses')
          .update(editForm)
          .eq('id', editingId);

        if (error) throw error;
        setExpenses(prev => prev.map(e => e.id === editingId ? { ...editForm, id: editingId } : e));
      } catch (e) {
        console.error("Failed to update in Supabase", e);
        setExpenses(prev => prev.map(e => e.id === editingId ? { ...editForm, id: editingId } : e));
      } finally {
        setEditingId(null);
        setEditForm(null);
      }
    }
  };

  // Calculations
  const totals = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    let weekly = 0;
    let monthly = 0;

    expenses.forEach(e => {
      const date = parseISO(e.date);
      if (isWithinInterval(date, { start: weekStart, end: weekEnd })) {
        weekly += e.amount;
      }
      if (isWithinInterval(date, { start: monthStart, end: monthEnd })) {
        monthly += e.amount;
      }
    });

    return { weekly, monthly };
  }, [expenses]);

  // Exports
  const exportExcel = () => {
    const data = expenses.map(e => ({
      Descrição: e.description,
      Valor: e.amount,
      Data: e.date
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Despesas");
    XLSX.writeFile(wb, "despesas_vozfinance.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Relatório de Despesas - VozFinance", 14, 15);
    
    const tableData = expenses.map(e => [
      e.description,
      `R$ ${e.amount.toFixed(2)}`,
      format(parseISO(e.date), 'dd/MM/yyyy')
    ]);

    (doc as any).autoTable({
      head: [['Descrição', 'Valor', 'Data']],
      body: tableData,
      startY: 25,
    });

    doc.save("despesas_vozfinance.pdf");
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-12 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-bold tracking-tighter text-stone-900 mb-2">VozFinance</h1>
          <p className="text-stone-500 font-medium italic">Sua voz, seu controle financeiro.</p>
        </div>
        
        <div className="flex gap-3 justify-center">
          <button 
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full text-sm font-semibold hover:bg-stone-50 transition-colors shadow-sm"
          >
            <Table size={16} className="text-green-600" /> Excel
          </button>
          <button 
            onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full text-sm font-semibold hover:bg-stone-50 transition-colors shadow-sm"
          >
            <FileText size={16} className="text-red-600" /> PDF
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-xl shadow-stone-200/50 flex items-center gap-5">
          <div className="w-14 h-14 bg-stone-900 rounded-2xl flex items-center justify-center text-white">
            <Calendar size={28} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-stone-400 mb-1">Soma Semanal</p>
            <p className="text-3xl font-bold text-stone-900">R$ {totals.weekly.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-xl shadow-stone-200/50 flex items-center gap-5">
          <div className="w-14 h-14 bg-stone-900 rounded-2xl flex items-center justify-center text-white">
            <Wallet size={28} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-stone-400 mb-1">Soma Mensal</p>
            <p className="text-3xl font-bold text-stone-900">R$ {totals.monthly.toFixed(2)}</p>
          </div>
        </div>
      </section>

      {/* Main Action: Voice Input */}
      <section className="mb-12 relative">
        <div className="flex flex-col items-center justify-center p-12 bg-stone-900 rounded-[3rem] text-white overflow-hidden">
          {/* Background Decoration */}
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-white blur-[100px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-white blur-[100px]" />
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startRecording}
            disabled={isProcessing}
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
              isRecording ? 'bg-red-500 shadow-[0_0_50px_rgba(239,68,68,0.5)]' : 'bg-white text-stone-900 shadow-2xl'
            }`}
          >
            {isRecording ? <MicOff size={40} /> : <Mic size={40} />}
            {isRecording && (
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-full border-4 border-red-500"
              />
            )}
          </motion.button>

          <div className="mt-8 text-center relative z-10">
            <h3 className="text-xl font-bold mb-2">
              {isRecording ? "Ouvindo..." : isProcessing ? "Processando..." : "Toque para falar"}
            </h3>
            <p className="text-stone-400 text-sm max-w-xs mx-auto">
              {isRecording ? "Diga a descrição e o valor da sua despesa." : "Ex: 'Supermercado 150 reais ontem'"}
            </p>
          </div>

          <AnimatePresence>
            {transcript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10 text-sm italic max-w-md"
              >
                &quot;{transcript}&quot;
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Expense List */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-stone-900">Últimas Despesas</h2>
          <span className="text-xs font-bold uppercase tracking-widest text-stone-400">{expenses.length} itens</span>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-stone-50 rounded-[3rem] border border-stone-100">
              <Loader2 className="w-10 h-10 text-stone-300 animate-spin mb-4" />
              <p className="text-stone-400 font-medium">Carregando suas despesas...</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {expenses.map((expense) => (
              <motion.div
                key={expense.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="group bg-white p-5 rounded-3xl border border-stone-100 shadow-sm hover:shadow-md transition-all flex items-center justify-between"
              >
                {editingId === expense.id ? (
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 mr-4">
                    <input
                      type="text"
                      value={editForm?.description}
                      onChange={e => setEditForm(prev => prev ? { ...prev, description: e.target.value } : null)}
                      className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                      placeholder="Descrição"
                    />
                    <input
                      type="number"
                      value={editForm?.amount}
                      onChange={e => setEditForm(prev => prev ? { ...prev, amount: parseFloat(e.target.value) } : null)}
                      className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                      placeholder="Valor"
                    />
                    <input
                      type="date"
                      value={editForm?.date}
                      onChange={e => setEditForm(prev => prev ? { ...prev, date: e.target.value } : null)}
                      className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-stone-50 rounded-2xl flex items-center justify-center text-stone-400 group-hover:bg-stone-900 group-hover:text-white transition-colors">
                      <Wallet size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-stone-900">{expense.description}</h4>
                      <p className="text-xs text-stone-400 font-medium">{format(parseISO(expense.date), "dd 'de' MMMM, yyyy", { locale: ptBR })}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4">
                  {editingId !== expense.id && (
                    <div className="text-right mr-4">
                      <p className="text-lg font-bold text-stone-900">R$ {expense.amount.toFixed(2)}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {editingId === expense.id ? (
                      <>
                        <button onClick={saveEdit} className="p-2 text-green-600 hover:bg-green-50 rounded-xl transition-colors">
                          <Check size={20} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                          <X size={20} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEditing(expense)} className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-50 rounded-xl transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => deleteExpense(expense.id)} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          )}

          {!isLoading && expenses.length === 0 && (
            <div className="text-center py-20 bg-stone-50 rounded-[3rem] border-2 border-dashed border-stone-200">
              <p className="text-stone-400 font-medium">Nenhuma despesa registrada ainda.</p>
              <p className="text-xs text-stone-300 mt-1">Use o microfone acima para começar.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="mt-20 pb-8 text-center text-stone-400 text-xs font-bold uppercase tracking-widest">
        VozFinance &copy; 2026
      </footer>
    </div>
  );
}
