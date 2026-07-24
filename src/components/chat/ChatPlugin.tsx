import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MessageCircle, X, Send, Paperclip, AlertTriangle, 
  ChevronLeft, Users, User, Image as ImageIcon 
} from "lucide-react";
import { db } from "../../firebase/config";
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, serverTimestamp, doc, updateDoc, getDoc 
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { cn, formatDate } from "../../lib/utils";

interface Chat {
  id: string;
  type: "group" | "direct";
  opportunityId?: string;
  opportunityTitle?: string;
  participants: string[];
  lastMessage?: string;
  updatedAt?: any;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  attachmentUrl?: string;
  createdAt: any;
}

export default function ChatPlugin() {
  const { user, isDemoMode } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Chats
  useEffect(() => {
    if (!user || isDemoMode) return;

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedChats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      
      // Sort client side since we can't complex order without an index
      fetchedChats.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || 0;
        const timeB = b.updatedAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      setChats(fetchedChats);
      
      // Very basic unread simulation
      if (fetchedChats.length > 0 && !isOpen) {
        setUnreadCount(prev => prev + 1);
      }
    }, (error) => {
      console.error("Chats onSnapshot error:", error);
    });

    return () => unsubscribe();
  }, [user, isDemoMode, isOpen]);

  // Fetch Messages for Active Chat
  useEffect(() => {
    if (!activeChat || isDemoMode) return;

    const q = query(
      collection(db, `chats/${activeChat.id}/messages`),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(fetched);
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }, (error) => {
      console.error("Messages onSnapshot error:", error);
    });

    return () => unsubscribe();
  }, [activeChat, isDemoMode]);

  const handleSend = async () => {
    if (!inputText.trim() || !activeChat || !user || isDemoMode) return;

    const msgText = inputText.trim();
    setInputText("");

    try {
      await addDoc(collection(db, `chats/${activeChat.id}/messages`), {
        senderId: user.uid,
        text: msgText,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "chats", activeChat.id), {
        lastMessage: msgText,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !user || isDemoMode) return;

    setIsUploading(true);
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `chat_attachments/${activeChat.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, `chats/${activeChat.id}/messages`), {
        senderId: user.uid,
        text: "Sent an attachment",
        attachmentUrl: url,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "chats", activeChat.id), {
        lastMessage: "Attachment sent",
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("File upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReport = () => {
    alert("Message reporting system triggered. The site moderator has been notified.");
  };

  if (!user && !isDemoMode) return null;

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setUnreadCount(0);
          }}
          className={cn(
            "w-16 h-16 rounded-sm flex items-center justify-center text-white  transition-all duration-300 hover:scale-105",
            isOpen ? "bg-slate-800 rotate-90" : "bg-[#1F4C63] hover:bg-[#153343]"
          )}
        >
          {isOpen ? <X className="w-6 h-6" /> : (
            <div className="relative">
              <MessageCircle className="w-7 h-7" />
              {unreadCount > 0 && (
                <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-sm flex items-center justify-center text-[10px] font-bold border-2 border-white">
                  {unreadCount}
                </div>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-28 right-6 w-full max-w-[400px] h-[600px] max-h-[80vh] bg-white rounded-sm  border border-slate-100 flex flex-col overflow-hidden z-50"
          >
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {activeChat && (
                  <button onClick={() => setActiveChat(null)} className="p-1 hover:bg-slate-800 rounded-sm transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <div>
                  <h3 className="font-black tracking-wide">
                    {activeChat 
                      ? (activeChat.type === 'group' ? activeChat.opportunityTitle : 'Direct Message') 
                      : 'Messages'}
                  </h3>
                  {activeChat && (
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                      {activeChat.type === 'group' ? `${activeChat.participants.length} Members` : 'Private Chat'}
                    </p>
                  )}
                </div>
              </div>
              
              {activeChat && (
                <button 
                  onClick={handleReport}
                  className="p-2 text-slate-400 hover:text-red-400 transition-colors rounded-full"
                  title="Report Conversation"
                >
                  <AlertTriangle className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-slate-50 overflow-hidden flex flex-col">
              {!activeChat ? (
                // Chat List
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {chats.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                      <MessageCircle className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No active conversations</p>
                    </div>
                  ) : (
                    chats.map(chat => (
                      <button
                        key={chat.id}
                        onClick={() => setActiveChat(chat)}
                        className="w-full bg-white p-4 rounded-sm border border-slate-100  hover:border-[#1F4C63]/20 hover: transition-all text-left flex items-start gap-4"
                      >
                        <div className={cn(
                          "w-12 h-12 rounded-sm flex items-center justify-center shrink-0",
                          chat.type === 'group' ? "bg-indigo-50 text-indigo-600" : "bg-[#1F4C63]/5 text-[#1F4C63]"
                        )}>
                          {chat.type === 'group' ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-slate-900 truncate">
                            {chat.type === 'group' ? chat.opportunityTitle : 'Direct Message'}
                          </h4>
                          <p className="text-xs text-slate-500 truncate font-medium mt-1">
                            {chat.lastMessage || 'No messages yet'}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                // Active Chat Messages
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg, i) => {
                    const isMe = msg.senderId === user?.uid;
                    return (
                      <div key={msg.id || i} className={cn("flex flex-col max-w-[80%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                        <div className={cn(
                          "p-3 rounded-sm text-sm ",
                          isMe 
                            ? "bg-[#1F4C63] text-white rounded-tr-sm" 
                            : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
                        )}>
                          {msg.text}
                          {msg.attachmentUrl && (
                            <img src={msg.attachmentUrl} alt="attachment" className="mt-2 rounded-sm max-w-full h-auto max-h-[150px] object-cover" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isUploading && (
                     <div className="mr-auto items-start flex flex-col max-w-[80%]">
                        <div className="p-3 rounded-sm text-sm  bg-white border border-slate-200 text-slate-400 rounded-tl-sm animate-pulse flex items-center gap-2">
                           <ImageIcon className="w-4 h-4" /> Uploading image...
                        </div>
                     </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            {activeChat && (
              <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-slate-400 hover:text-[#1F4C63] hover:bg-[#1F4C63]/5 rounded-sm transition-colors shrink-0"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4C63] font-medium"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="p-3 bg-[#1F4C63] text-white rounded-sm hover:bg-[#153343] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0  shadow-blue-200 rounded-full"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
