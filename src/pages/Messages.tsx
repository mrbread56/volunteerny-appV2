import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Send,
  Paperclip,
  AlertTriangle,
  ChevronLeft,
  Users,
  User,
  FileText,
  ShieldAlert,
  X,
} from "lucide-react";
import { db } from "../firebase/config";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { cn } from "../lib/utils";
import { directChatId, OPEN_CHAT_EVENT, OpenChatRequestDetail, consumeLastOpenChatRequest } from "../lib/chatBus";
import ReportModal from "../components/ReportModal";

interface Chat {
  id: string;
  type: "group" | "direct";
  opportunityId?: string;
  opportunityTitle?: string;
  participants: string[];
  lastMessage?: string;
  updatedAt?: any;
  lastRead?: Record<string, any>;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  attachmentUrl?: string;
  attachmentIsPdf?: boolean;
  createdAt: any;
}

const MAX_ATTACHMENT_MB = 10;

export default function Messages() {
  const { user, userProfile, isDemoMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [nameCache, setNameCache] = useState<Record<string, string>>({});
  const nameCacheRef = useRef<Record<string, string>>({});
  const [showReport, setShowReport] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatsLoadedOnce = useRef(false);

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  // --- Resolve a chat's display name (group title, or the other party's real name) ---
  const resolveOtherPartyName = useCallback(
    async (otherUid: string): Promise<string> => {
      if (nameCacheRef.current[otherUid]) return nameCacheRef.current[otherUid];
      try {
        if (userProfile?.role === "organization") {
          const snap = await getDoc(doc(db, "students", otherUid));
          const name = snap.exists() ? (snap.data() as any).fullName : null;
          const resolved = name || "Student";
          nameCacheRef.current = { ...nameCacheRef.current, [otherUid]: resolved };
          setNameCache({ ...nameCacheRef.current });
          return resolved;
        } else {
          const snap = await getDoc(doc(db, "organizations", otherUid));
          const name = snap.exists() ? (snap.data() as any).organizationName : null;
          const resolved = name || "Organization";
          nameCacheRef.current = { ...nameCacheRef.current, [otherUid]: resolved };
          setNameCache({ ...nameCacheRef.current });
          return resolved;
        }
      } catch {
        return userProfile?.role === "organization" ? "Student" : "Organization";
      }
    },
    [userProfile?.role]
  );

  useEffect(() => {
    chats.forEach((chat) => {
      if (chat.type === "direct" && user) {
        const otherUid = chat.participants.find((p) => p !== user.uid);
        if (otherUid && !nameCache[otherUid]) {
          resolveOtherPartyName(otherUid);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, user]);

  const chatTitle = (chat: Chat): string => {
    if (chat.type === "group") return chat.opportunityTitle || "Opportunity Group";
    const otherUid = user ? chat.participants.find((p) => p !== user.uid) : undefined;
    if (!otherUid) return "Direct Message";
    return nameCache[otherUid] || "Loading...";
  };

  const isChatUnread = (chat: Chat): boolean => {
    if (!user) return false;
    if (!chat.lastMessage) return false;
    const updatedMillis = chat.updatedAt?.toMillis?.() || 0;
    const readMillis = chat.lastRead?.[user.uid]?.toMillis?.() || 0;
    return updatedMillis > readMillis;
  };

  const unreadTotal = chats.filter(isChatUnread).length;

  // --- Fetch chats list ---
  useEffect(() => {
    if (!user || isDemoMode) return;

    const q = query(collection(db, "chats"), where("participants", "array-contains", user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Chat[];
        fetched.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setChats(fetched);
        chatsLoadedOnce.current = true;
      },
      (error) => {
        console.error("Chats onSnapshot error:", error);
      }
    );

    return () => unsubscribe();
  }, [user, isDemoMode]);

  // --- Fetch messages for the active chat ---
  useEffect(() => {
    if (!activeChatId || isDemoMode) {
      setMessages([]);
      return;
    }

    const q = query(collection(db, `chats/${activeChatId}/messages`), orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Message[];
        setMessages(fetched);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      },
      (error) => {
        console.error("Messages onSnapshot error:", error);
      }
    );

    return () => unsubscribe();
  }, [activeChatId, isDemoMode]);

  // --- Mark the active chat as read for me (persists across sessions/devices) ---
  useEffect(() => {
    if (!activeChatId || !user || isDemoMode) return;
    updateDoc(doc(db, "chats", activeChatId), {
      [`lastRead.${user.uid}`]: serverTimestamp(),
    }).catch((err) => console.error("Failed to mark chat as read:", err));
  }, [activeChatId, user, isDemoMode]);

  // --- Handle "open a direct chat with this user" requests from other pages ---
  const openDirectChatWith = useCallback(
    async (otherUserId: string) => {
      if (!user) return;
      const chatId = directChatId(user.uid, otherUserId);
      try {
        const chatRef = doc(db, "chats", chatId);
        const snap = await getDoc(chatRef);
        if (!snap.exists()) {
          // Only organizations are allowed to create chats - matches the
          // "you have to be an organization to start a direct chat" rule.
          if (userProfile?.role !== "organization") {
            console.warn("Only organizations can start a new direct chat.");
            return;
          }
          await setDoc(chatRef, {
            type: "direct",
            participants: [user.uid, otherUserId],
            updatedAt: serverTimestamp(),
            lastMessage: "Conversation started.",
          });
        }
        setActiveChatId(chatId);
      } catch (err) {
        console.error("Failed to open direct chat:", err);
      }
    },
    [user, userProfile?.role]
  );

  useEffect(() => {
    if (!user || isDemoMode) return;

    // Picked up a request that fired just before this page finished mounting
    const pending = consumeLastOpenChatRequest();
    const fromRoute = (location.state as any)?.openWithUserId as string | undefined;
    const target = pending?.otherUserId || fromRoute;
    if (target) {
      openDirectChatWith(target);
      if (fromRoute) {
        navigate(location.pathname, { replace: true, state: {} });
      }
    }

    const listener = (e: Event) => {
      const detail = (e as CustomEvent<OpenChatRequestDetail>).detail;
      if (detail?.otherUserId) openDirectChatWith(detail.otherUserId);
    };
    window.addEventListener(OPEN_CHAT_EVENT, listener);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isDemoMode]);

  const handleSend = async () => {
    const msgText = inputText.trim();
    if (!msgText || !activeChatId || !user || isDemoMode) return;

    setSendError(null);
    // Don't clear the input until we know the write actually succeeded -
    // a failed send used to silently drop the message the user just typed.
    try {
      await addDoc(collection(db, `chats/${activeChatId}/messages`), {
        senderId: user.uid,
        text: msgText,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", activeChatId), {
        lastMessage: msgText,
        updatedAt: serverTimestamp(),
        [`lastRead.${user.uid}`]: serverTimestamp(),
      });
      setInputText("");
    } catch (err) {
      console.error("Failed to send message", err);
      setSendError("That message didn't send. Check your connection and try again.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !activeChatId || !user || isDemoMode) return;

    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setSendError(`That file is too large - attachments are limited to ${MAX_ATTACHMENT_MB}MB.`);
      return;
    }
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setSendError("Only images and PDFs can be attached.");
      return;
    }

    setSendError(null);
    setIsUploading(true);
    const captionText = inputText.trim();
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `chat_attachments/${activeChatId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const text = captionText || (isPdf ? "Sent a PDF attachment" : "Sent an image attachment");

      await addDoc(collection(db, `chats/${activeChatId}/messages`), {
        senderId: user.uid,
        text,
        attachmentUrl: url,
        attachmentIsPdf: isPdf,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "chats", activeChatId), {
        lastMessage: isPdf ? "📄 Sent a PDF" : "📷 Sent an image",
        updatedAt: serverTimestamp(),
        [`lastRead.${user.uid}`]: serverTimestamp(),
      });
      setInputText("");
    } catch (err) {
      console.error("File upload failed", err);
      setSendError("That attachment didn't send. Check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Who to report, for the active chat. Direct chats target the other
  // person directly; group chats target participants[0], which is always
  // the organization for chats this app creates.
  const reportTarget = (() => {
    if (!activeChat || !user) return null;
    if (activeChat.type === "direct") {
      const otherUid = activeChat.participants.find((p) => p !== user.uid);
      if (!otherUid) return null;
      return {
        reportedUserId: otherUid,
        reportedUserName: nameCache[otherUid] || "This user",
        reportedUserRole: (userProfile?.role === "organization" ? "student" : "organization") as
          | "student"
          | "organization",
      };
    }
    const orgUid = activeChat.participants[0];
    if (orgUid === user.uid) {
      const otherUid = activeChat.participants.find((p) => p !== user.uid);
      if (!otherUid) return null;
      return { reportedUserId: otherUid, reportedUserName: "A group member", reportedUserRole: "student" as const };
    }
    return { reportedUserId: orgUid, reportedUserName: activeChat.opportunityTitle || "This organization", reportedUserRole: "organization" as const };
  })();

  if (!user && !isDemoMode) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <p>Please sign in to view messages.</p>
      </div>
    );
  }

  if (isDemoMode) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <MessageCircle className="w-12 h-12 opacity-20 mx-auto mb-4" />
        <h1 className="text-2xl font-black text-slate-900 mb-2">Messages</h1>
        <p className="text-sm text-slate-500 font-medium">
          Messaging uses your real account data and isn't available in demo mode.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Messages</h1>
        {unreadTotal > 0 && (
          <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
            {unreadTotal} unread
          </span>
        )}
      </div>

      <div className="bg-white border border-slate-100 rounded-sm overflow-hidden flex h-[75vh] min-h-[480px]">
        {/* Chat list */}
        <div
          className={cn(
            "w-full sm:w-[320px] shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/50",
            activeChatId ? "hidden sm:flex" : "flex"
          )}
        >
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chats.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 px-6 text-center">
                <MessageCircle className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">
                  No conversations yet. {userProfile?.role === "organization" ? "Accept an applicant to start one automatically, or message someone directly from Review Profile." : "An organization will reach out once they accept your application."}
                </p>
              </div>
            ) : (
              chats.map((chat) => {
                const unread = isChatUnread(chat);
                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChatId(chat.id)}
                    className={cn(
                      "w-full bg-white p-3.5 rounded-sm border text-left flex items-start gap-3 transition-all",
                      chat.id === activeChatId ? "border-[#1F4C63] ring-1 ring-[#1F4C63]/20" : "border-slate-100 hover:border-[#1F4C63]/20"
                    )}
                  >
                    <div
                      className={cn(
                        "w-11 h-11 rounded-sm flex items-center justify-center shrink-0",
                        chat.type === "group" ? "bg-indigo-50 text-indigo-600" : "bg-[#1F4C63]/5 text-[#1F4C63]"
                      )}
                    >
                      {chat.type === "group" ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className={cn("truncate text-sm", unread ? "font-black text-slate-900" : "font-bold text-slate-700")}>
                          {chatTitle(chat)}
                        </h4>
                        {unread && <span className="w-2 h-2 rounded-full bg-[#1F4C63] shrink-0" />}
                      </div>
                      <p className={cn("text-xs truncate mt-0.5", unread ? "text-slate-700 font-semibold" : "text-slate-500 font-medium")}>
                        {chat.lastMessage || "No messages yet"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active thread */}
        <div className={cn("flex-1 flex flex-col min-w-0", activeChatId ? "flex" : "hidden sm:flex")}>
          {!activeChat ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
              <MessageCircle className="w-14 h-14 opacity-30" />
              <p className="text-sm font-medium text-slate-400">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setActiveChatId(null)}
                    className="p-1 hover:bg-slate-800 rounded-sm transition-colors sm:hidden"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <h3 className="font-black tracking-wide truncate">{chatTitle(activeChat)}</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                      {activeChat.type === "group" ? `${activeChat.participants.length} members` : "Private chat"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowReport(true)}
                  className="p-2 text-slate-400 hover:text-red-400 transition-colors shrink-0"
                  title="Report this conversation"
                >
                  <AlertTriangle className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-start gap-2 shrink-0">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10.5px] leading-relaxed text-amber-800 font-medium">
                  Messages here aren't actively moderated in real time. Don't share passwords, financial details, or
                  anything you wouldn't want kept on record. You use this chat at your own risk - use the flag icon
                  above to report anything that concerns you.
                </p>
              </div>

              <div className="flex-1 bg-slate-50 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => {
                  const isMe = msg.senderId === user?.uid;
                  return (
                    <div key={msg.id || i} className={cn("flex flex-col max-w-[80%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                      <div
                        className={cn(
                          "p-3 rounded-sm text-sm",
                          isMe ? "bg-[#1F4C63] text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
                        )}
                      >
                        {msg.text}
                        {msg.attachmentUrl && msg.attachmentIsPdf && (
                          <a
                            href={msg.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "mt-2 flex items-center gap-2 text-xs font-bold underline underline-offset-2",
                              isMe ? "text-white" : "text-[#1F4C63]"
                            )}
                          >
                            <FileText className="w-4 h-4 shrink-0" /> View PDF
                          </a>
                        )}
                        {msg.attachmentUrl && !msg.attachmentIsPdf && (
                          <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.attachmentUrl}
                              alt="attachment"
                              className="mt-2 rounded-sm max-w-full h-auto max-h-[220px] object-cover"
                            />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isUploading && (
                  <div className="mr-auto items-start flex flex-col max-w-[80%]">
                    <div className="p-3 rounded-sm text-sm bg-white border border-slate-200 text-slate-400 rounded-tl-sm animate-pulse flex items-center gap-2">
                      <Paperclip className="w-4 h-4" /> Uploading attachment...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {sendError && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between gap-2 shrink-0">
                  <p className="text-xs text-red-600 font-semibold">{sendError}</p>
                  <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-3 text-slate-400 hover:text-[#1F4C63] hover:bg-[#1F4C63]/5 rounded-sm transition-colors shrink-0 disabled:opacity-50"
                  title="Attach an image or PDF"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-sm px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4C63] font-medium"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="p-3 bg-[#1F4C63] text-white rounded-sm hover:bg-[#153343] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 rounded-full"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {reportTarget && (
        <ReportModal
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          reportedUserId={reportTarget.reportedUserId}
          reportedUserName={reportTarget.reportedUserName}
          reportedUserRole={reportTarget.reportedUserRole}
        />
      )}
    </div>
  );
}
