import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  Calendar as CalendarIcon, 
  Plus, 
  Sparkles,
  Info,
  CalendarCheck2,
  Download,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db } from '../firebase/config';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

interface CalendarViewProps {
  studentProfile: any;
  isDemoMode: boolean;
  user: any;
  refreshProfile: () => Promise<void>;
}

export default function CalendarView({ studentProfile, isDemoMode, user, refreshProfile }: CalendarViewProps) {
  const { calendarToken, connectCalendar, disconnectCalendar } = useAuth();
  
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDateStr, setSelectedDateStr] = useState<string>('');

  const [acceptedOpps, setAcceptedOpps] = useState<any[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(false);
  
  const [isLinking, setIsLinking] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<Record<string, string>>({});

  // Sizing and parameters for logs
  const [showQuickLogForm, setShowQuickLogForm] = useState(false);
  const [quickActivity, setQuickActivity] = useState('');
  const [quickOrg, setQuickOrg] = useState('');
  const [quickHours, setQuickHours] = useState('');
  const [quickCoordinatorName, setQuickCoordinatorName] = useState('');
  const [quickCoordinatorContact, setQuickCoordinatorContact] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
  const [quickSuccess, setQuickSuccess] = useState(false);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    // Default select today
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setSelectedDateStr(`${y}-${m}-${day}`);
  }, []);

  const extractDateStr = (dateTime: any): string => {
    if (!dateTime) return '';
    let d: Date;
    if (dateTime.toDate && typeof dateTime.toDate === 'function') {
      d = dateTime.toDate();
    } else {
      d = new Date(dateTime);
    }
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    const fetchAcceptedApps = async () => {
      setLoadingOpps(true);
      try {
        if (isDemoMode) {
          const storedApps = localStorage.getItem('demo_applications');
          let apps = storedApps ? JSON.parse(storedApps) : [];
          const studentApps = apps.filter((a: any) => (a.studentId === 'demo-student-1' || a.studentId === user?.uid) && a.status === 'accepted');
          
          const demoOppsList = [
            {
              id: 'demo-opp-1',
              title: 'Math Tutor for Grade 9 Students',
              orgName: 'North York Community Hub',
              description: 'This is a tutoring session helping local high-school students improve their foundational math proficiency.',
              location: '5100 Yonge St, North York',
              category: 'Tutoring',
              timeCommitment: '14:00 - 16:00',
              dateTime: new Date(Date.now() + 86400000 * 5).toISOString(),
            },
            {
              id: 'demo-opp-2',
              title: 'Community Garden Cleanup',
              orgName: 'Sustainable Downsview',
              description: 'Help restore standard biodiversity and maintain community flower/vegetable gardens in Downsview Park.',
              location: 'Downsview Park, North York',
              category: 'Environment',
              timeCommitment: '10:00 - 13:00',
              dateTime: new Date(Date.now() + 86400000 * 7).toISOString(),
            },
            {
              id: 'demo-opp-3',
              title: 'Technical Support Volunteer',
              orgName: 'North York Senior Center',
              description: 'Guide senior citizens in setting up accounts, emails, zoom, or using desktop and smartphone devices.',
              location: 'Mel Lastman Square, North York',
              category: 'Technology',
              timeCommitment: '11:00 - 15:00',
              dateTime: new Date(Date.now() + 86400000 * 10).toISOString(),
            }
          ];

          const results = studentApps.map((app: any) => {
            const matchedOpp = demoOppsList.find(o => o.id === app.opportunityId) || {
              id: app.opportunityId,
              title: app.opportunityTitle || 'Volunteering Event',
              orgName: 'Community Partner',
              description: 'Volunteering event description.',
              location: 'North York',
              category: 'Volunteer',
              timeCommitment: '09:00 - 12:00',
              dateTime: app.appliedAt || new Date().toISOString()
            };
            return matchedOpp;
          });
          setAcceptedOpps(results);
        } else {
          const { collection, query, where, getDocs, getDoc, doc } = await import('firebase/firestore');
          const appsQuery = query(
            collection(db, 'applications'),
            where('studentId', '==', user.uid),
            where('status', '==', 'accepted')
          );
          const appsSnap = await getDocs(appsQuery);
          const oppsList: any[] = [];
          
          for (const d of appsSnap.docs) {
            const appData = d.data();
            const oppId = appData.opportunityId;
            const oppDoc = await getDoc(doc(db, 'opportunities', oppId));
            if (oppDoc.exists()) {
              oppsList.push({ id: oppDoc.id, ...oppDoc.data() });
            } else {
              oppsList.push({
                id: oppId,
                title: appData.opportunityTitle || 'Volunteer Event',
                orgName: 'Registered Coordinator',
                description: 'Volunteering shift and community service.',
                location: 'North York',
                category: 'Volunteer',
                timeCommitment: '09:00 - 12:00',
                dateTime: appData.appliedAt
              });
            }
          }
          setAcceptedOpps(oppsList);
        }
      } catch (err) {
        console.error('Failed to load student accepted events:', err);
      } finally {
        setLoadingOpps(false);
      }
    };

    if (user) {
      fetchAcceptedApps();
    }
  }, [user, isDemoMode]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const startOffset = getFirstDayOfMonth(currentYear, currentMonth);
  
  const getFormattedDateString = (dayNum: number) => {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    return `${currentYear}-${mm}-${dd}`;
  };

  const loggedHoursList = studentProfile?.loggedHours || [];

  const getLogsForDate = (dateStr: string) => {
    return loggedHoursList.filter((log: any) => log.date === dateStr);
  };

  const checkHasLogs = (dateStr: string) => {
    return getLogsForDate(dateStr).length > 0;
  };

  const getOppsForDate = (dateStr: string) => {
    return acceptedOpps.filter((opp: any) => {
      const oppDate = extractDateStr(opp.dateTime);
      if (oppDate === dateStr) return true;
      if (opp.shifts && Array.isArray(opp.shifts)) {
        return opp.shifts.some((s: any) => s.date === dateStr);
      }
      return false;
    });
  };

  const checkHasOpps = (dateStr: string) => {
    return getOppsForDate(dateStr).length > 0;
  };

  const getDayTotalHours = (dateStr: string) => {
    const logs = getLogsForDate(dateStr);
    return logs.reduce((acc: number, curr: any) => acc + Number(curr.hours || 0), 0);
  };

  const handleDayClick = (dayNum: number) => {
    const dStr = getFormattedDateString(dayNum);
    setSelectedDateStr(dStr);
    setShowQuickLogForm(false);
  };

  const handleToggleGoogleLink = async () => {
    const isLinked = localStorage.getItem('calendar_connected_state') === 'true';
    if (isLinked) {
      disconnectCalendar();
    } else {
      setIsLinking(true);
      await connectCalendar();
      setIsLinking(false);
    }
  };

  const handleAddToGoogleCalendar = async (opp: any) => {
    const isLinked = localStorage.getItem('calendar_connected_state') === 'true';
    let token = calendarToken;
    
    if (!token && isDemoMode) {
      token = "demo-calendar-token-123456";
    }

    if (!isLinked || !token) {
      setSyncFeedback(prev => ({ ...prev, [opp.id]: 'linking' }));
      try {
        const t = await connectCalendar();
        if (!t) {
          setSyncFeedback(prev => ({ ...prev, [opp.id]: 'Failed Google authorization.' }));
          return;
        }
        token = t;
      } catch (err) {
        setSyncFeedback(prev => ({ ...prev, [opp.id]: 'Authorization failed.' }));
        return;
      }
    }

    setSyncFeedback(prev => ({ ...prev, [opp.id]: 'syncing' }));

    if (isDemoMode || (token && token.startsWith("demo-"))) {
      setTimeout(() => {
        setSyncFeedback(prev => ({ ...prev, [opp.id]: 'success-google' }));
        setTimeout(() => {
          setSyncFeedback(prev => {
            const c = { ...prev };
            delete c[opp.id];
            return c;
          });
        }, 6000);
      }, 1000);
      return;
    }

    try {
      const oppDateStr = extractDateStr(opp.dateTime) || selectedDateStr;
      let startTimeStr = '09:00';
      let endTimeStr = '12:00';

      if (opp.shifts && opp.shifts[0]) {
        startTimeStr = opp.shifts[0].startTime || '09:00';
        endTimeStr = opp.shifts[0].endTime || '12:00';
      } else if (opp.timeCommitment) {
        const match = opp.timeCommitment.match(/(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/);
        if (match) {
          startTimeStr = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
          endTimeStr = `${String(match[3]).padStart(2, '0')}:${match[4]}`;
        }
      }

      const startDateTimeStr = `${oppDateStr}T${startTimeStr}:00`;
      const endDateTimeStr = `${oppDateStr}T${endTimeStr}:00`;

      const startObj = new Date(startDateTimeStr);
      const endObj = new Date(endDateTimeStr);

      const eventPayload = {
        summary: `Volunteer: ${opp.title}`,
        location: opp.location || 'North York, NY',
        description: `${opp.description}\n\nOrganization: ${opp.orgName || 'Community Coordinator'}\nCategory: ${opp.category}\n\nSynced via Volunteer NY.`,
        start: {
          dateTime: startObj.toISOString()
        },
        end: {
          dateTime: endObj.toISOString()
        }
      };

      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventPayload)
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Google Calendar API failure:', text);
        setSyncFeedback(prev => ({ ...prev, [opp.id]: 'Error adding event (verify access scopes).' }));
      } else {
        setSyncFeedback(prev => ({ ...prev, [opp.id]: 'success-google' }));
        setTimeout(() => {
          setSyncFeedback(prev => {
            const c = { ...prev };
            delete c[opp.id];
            return c;
          });
        }, 6000);
      }
    } catch (e: any) {
      console.error('Google Calendar error:', e);
      setSyncFeedback(prev => ({ ...prev, [opp.id]: e.message || 'Network write error.' }));
    }
  };

  const getGoogleCalendarFallbackUrl = (opp: any) => {
    try {
      const oppDateStr = extractDateStr(opp.dateTime) || selectedDateStr;
      let startTimeStr = '09:00';
      let endTimeStr = '12:00';

      if (opp.shifts && opp.shifts[0]) {
        startTimeStr = opp.shifts[0].startTime || '09:00';
        endTimeStr = opp.shifts[0].endTime || '12:00';
      } else if (opp.timeCommitment) {
        const match = opp.timeCommitment.match(/(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/);
        if (match) {
          startTimeStr = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
          endTimeStr = `${String(match[3]).padStart(2, '0')}:${match[4]}`;
        }
      }

      const startObj = new Date(`${oppDateStr}T${startTimeStr}:00`);
      const endObj = new Date(`${oppDateStr}T${endTimeStr}:00`);

      const formatGoogleDate = (date: Date) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        const hh = String(date.getUTCHours()).padStart(2, '0');
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        return `${y}${m}${d}T${hh}${mm}${ss}Z`;
      };

      const datesParam = `${formatGoogleDate(startObj)}/${formatGoogleDate(endObj)}`;
      const detailsParam = `${opp.description || ''}\n\nOrganization: ${opp.orgName || 'Community Partner'}\nCategory: ${opp.category || 'Volunteer'}\n\nSynced via Volunteer NY.`;
      
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `Volunteer: ${opp.title}`,
        dates: datesParam,
        details: detailsParam,
        location: opp.location || 'North York, ON',
      });

      return `https://calendar.google.com/calendar/u/0/r/eventedit?${params.toString()}`;
    } catch (err) {
      return `https://calendar.google.com/calendar`;
    }
  };

  const handleAddToAppleCalendar = (opp: any) => {
    try {
      const oppDateStr = extractDateStr(opp.dateTime) || selectedDateStr;
      let startTimeStr = '09:00';
      let endTimeStr = '12:00';

      if (opp.shifts && opp.shifts[0]) {
        startTimeStr = opp.shifts[0].startTime || '09:00';
        endTimeStr = opp.shifts[0].endTime || '12:00';
      } else if (opp.timeCommitment) {
        const match = opp.timeCommitment.match(/(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/);
        if (match) {
          startTimeStr = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
          endTimeStr = `${String(match[3]).padStart(2, '0')}:${match[4]}`;
        }
      }

      const startObj = new Date(`${oppDateStr}T${startTimeStr}:00`);
      const endObj = new Date(`${oppDateStr}T${endTimeStr}:00`);

      const formatICSDate = (date: Date) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        const hh = String(date.getUTCHours()).padStart(2, '0');
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        return `${y}${m}${d}T${hh}${mm}${ss}Z`;
      };

      const cleanSummary = opp.title.replace(/[,;]/g, '\\$&');
      const cleanDesc = `${opp.description}\n\nOrganization: ${opp.orgName || 'Coordinator'}\nCategory: ${opp.category}`.replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&');
      const cleanLoc = (opp.location || 'North York').replace(/[,;]/g, '\\$&');

      const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Volunteer NY//NONSGML Event Calendar//EN',
        'BEGIN:VEVENT',
        `UID:volunteerny-opp-${opp.id}-${Date.now()}@volunteerny.ca`,
        `DTSTAMP:${formatICSDate(new Date())}`,
        `DTSTART:${formatICSDate(startObj)}`,
        `DTEND:${formatICSDate(endObj)}`,
        `SUMMARY:Volunteer: ${cleanSummary}`,
        `DESCRIPTION:${cleanDesc}`,
        `LOCATION:${cleanLoc}`,
        'END:VEVENT',
        'END:VCALENDAR'
      ];

      const icsContent = icsLines.join('\r\n');
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${opp.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_schedule.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSyncFeedback(prev => ({ ...prev, [opp.id]: 'success-apple' }));
      setTimeout(() => {
        setSyncFeedback(prev => {
          const c = { ...prev };
          delete c[opp.id];
          return c;
        });
      }, 5000);
    } catch (e) {
      console.error('Apple Calendar Export error:', e);
    }
  };

  const parsedSelectedDate = new Date(selectedDateStr + 'T12:00:00');
  const selectedDateLogs = getLogsForDate(selectedDateStr);
  const selectedDateOpps = getOppsForDate(selectedDateStr);
  
  const isGoogleCalendarLinked = localStorage.getItem('calendar_connected_state') === 'true';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
      {/* Left panel: Calendar Monthly Grid and Google Linker Console */}
      <div className="lg:col-span-8 space-y-6">
        
        {/* Google Calendar Authorizer Banner */}
        <Card className="rounded-sm border border-[#1F4C63]/10  /50 /20 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex gap-3.5 items-start">
            <span className="p-3 bg-[#1F4C63]/10/60 rounded-sm text-[#1F4C63] block shrink-0">
              <CalendarCheck2 className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-slate-950 text-sm leading-snug flex items-center gap-2">
                Google Calendar Synchronization
                {isGoogleCalendarLinked && (
                  <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/15 px-2 py-0.5 rounded-sm text-[8.5px] uppercase font-black tracking-widest leading-none">Connected</span>
                )}
              </h3>
              <p className="text-[11px] font-semibold text-slate-600 mt-1 max-w-lg">
                Link your Google Calendar to synchronize scheduled volunteer shifts with your personal agenda in one click.
              </p>
            </div>
          </div>
          <Button
            onClick={handleToggleGoogleLink}
            variant={isGoogleCalendarLinked ? "outline" : "default"}
            disabled={isLinking}
            className={cn(
              "rounded-sm h-10 px-4 font-black uppercase text-[10px] tracking-wider shrink-0 transition-colors",
              isGoogleCalendarLinked 
                ? "border-slate-200 hover:bg-slate-50 text-slate-600" 
                : "bg-[#1F4C63] hover:bg-[#153343] text-white  shadow-blue-100 animate-pulse"
            )}
          >
            {isLinking ? "Configuring..." : isGoogleCalendarLinked ? "Disconnect Google" : "Connect Google Calendar"}
          </Button>
        </Card>

        {/* Calendar Monthly Card */}
        <Card className="rounded-sm border border-slate-100  bg-white overflow-hidden p-6 md:p-8">
          <div className="flex items-center justify-between pb-6 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#1F4C63] animate-pulse" />
              <h2 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
                {monthNames[currentMonth]} {currentYear}
              </h2>
            </div>

            <div className="flex items-center gap-2 border border-slate-100 p-1 bg-slate-50/50 rounded-sm">
              <button 
                onClick={handlePrevMonth}
                className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-800 hover:bg-white rounded-sm transition-all cursor-pointer outline-none rounded-full"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={handleNextMonth}
                className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-800 hover:bg-white rounded-sm transition-all cursor-pointer outline-none rounded-full"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-3 py-6 text-center">
            {/* Weekdays headers */}
            {weekdays.map((day) => (
              <span key={day} className="text-[10px] text-slate-600 font-black uppercase tracking-wider">
                {day}
              </span>
            ))}

            {/* Empty starts padding */}
            {Array.from({ length: startOffset }).map((_, idx) => (
              <div 
                key={`empty-${idx}`} 
                className="aspect-square bg-slate-50/40 border border-transparent rounded-sm opacity-30 select-none pointer-events-none" 
              />
            ))}

            {/* Actual day grid */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const dStr = getFormattedDateString(day);
              const isSelected = selectedDateStr === dStr;
              const hasLogs = checkHasLogs(dStr);
              const hasOpps = checkHasOpps(dStr);
              const dayHoursSum = getDayTotalHours(dStr);
              const today = new Date();
              const isCurrentDayMatch = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;

              return (
                <div
                  key={`day-${day}`}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "aspect-square rounded-sm md:rounded-sm border flex flex-col items-center justify-between p-2 cursor-pointer transition-all duration-200 relative select-none",
                    isSelected 
                      ? "bg-slate-950 border-slate-950 text-white  shadow-slate-900/10 scale-105 z-10" 
                      : hasLogs
                        ? "bg-emerald-50/50 hover:bg-emerald-100/40 border-emerald-100 text-emerald-950 hover:border-emerald-200"
                        : hasOpps
                          ? "bg-[#1F4C63]/5/20 hover:bg-[#1F4C63]/5/80 border-[#1F4C63]/10 text-blue-900 hover:border-[#1F4C63]/20"
                          : "bg-white hover:bg-slate-50 border-slate-100 text-slate-800 hover:border-slate-200",
                    isCurrentDayMatch && !isSelected && "border-[#1F4C63] ring-2 ring-[#1F4C63]/10"
                  )}
                >
                  <span className={cn(
                    "text-xs md:text-sm font-black flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-sm",
                    isCurrentDayMatch ? "bg-[#1F4C63] text-white font-black" : "text-slate-800",
                    isSelected && "text-white bg-transparent font-black"
                  )}>
                    {day}
                  </span>

                  {dayHoursSum > 0 ? (
                    <span className={cn(
                      "text-[8px] md:text-[9px] font-black tracking-tighter block uppercase",
                      isSelected ? "text-emerald-300" : "text-emerald-600"
                    )}>
                      +{dayHoursSum}hr{dayHoursSum !== 1 && 's'}
                    </span>
                  ) : hasOpps ? (
                    <span className={cn(
                      "text-[8px] md:text-[8.5px] font-black tracking-tighter block uppercase opacity-85",
                      isSelected ? "text-blue-200" : "text-[#1F4C63]"
                    )}>
                      Scheduled
                    </span>
                  ) : <span className="h-2" />}

                  {/* Indicator Dot */}
                  <div className="flex gap-1 justify-center">
                    {hasLogs && (
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-sm block",
                        isSelected ? "bg-emerald-300" : "bg-emerald-500 animate-pulse"
                      )} />
                    )}
                    {hasOpps && (
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-sm block",
                        isSelected ? "bg-blue-200" : "bg-[#1F4C63]"
                      )} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-sm p-4 text-[11px] text-slate-600 flex items-center gap-2 border border-slate-100">
              <Info className="w-4 h-4 text-slate-600 shrink-0" />
              <span className="font-semibold text-slate-600">
                <strong className="text-slate-800 font-bold">Logged Hours (Emerald):</strong> Confirmed volunteer credits and approved supervision reports.
              </span>
            </div>
            
            <div className="bg-slate-50 rounded-sm p-4 text-[11px] text-slate-600 flex items-center gap-2 border border-slate-100">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="font-semibold text-slate-600">
                <strong className="text-slate-800 font-bold">Upcoming Shift (Blue):</strong> Verified volunteer applications accepted by organizations.
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Right panel: Active Agenda detail of chosen day */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="rounded-sm border border-slate-100  bg-white overflow-hidden flex flex-col min-h-[460px]">
          <CardHeader className="border-b border-slate-50 bg-slate-50/30 p-6 md:p-8 shrink-0">
            <span className="text-[9px] font-black tracking-[0.2em] text-[#1F4C63] uppercase block">Selected Date Agenda</span>
            <CardTitle className="text-base text-slate-900 font-black uppercase tracking-tight mt-1">
              {parsedSelectedDate && !isNaN(parsedSelectedDate.getTime()) 
                ? parsedSelectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                : 'Choose a date'}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6 md:p-8 flex-1 flex flex-col justify-between">
            <div className="space-y-6">
              
              {/* SECTION: Scheduled Volunteer Events */}
              <div>
                <h4 className="text-[10px] uppercase font-black tracking-widest text-slate-600 mb-3 block">Upcoming Schedule</h4>
                {selectedDateOpps.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDateOpps.map((opp: any) => (
                      <div key={opp.id} className="p-4 rounded-sm bg-[#1F4C63]/5/15 border border-[#1F4C63]/10/50 space-y-3 relative animate-fadeIn">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="text-xs font-black text-slate-900">{opp.title}</h5>
                            <span className="text-[8.5px] uppercase font-extrabold tracking-widest bg-[#1F4C63]/10 text-[#153343] px-1.5 py-0.5 rounded leading-none">
                              Accepted
                            </span>
                          </div>
                          <p className="text-[10.5px] font-bold text-blue-800 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0 text-[#1F4C63]" /> {opp.location}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-600 mt-0.5">by {opp.orgName || "Verified Organization"}</p>
                        </div>

                        {/* Calendar export buttons */}
                        <div className="pt-2 border-t border-slate-100/40 space-y-2">
                          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Sync Shift to Calendar</p>
                          <div className="grid grid-cols-2 gap-2">
                            
                            {/* Google Calendar export */}
                            <button
                              onClick={() => handleAddToGoogleCalendar(opp)}
                              className="h-8 rounded-sm bg-slate-900 hover:bg-slate-800 transition-colors text-white font-extrabold flex items-center justify-center gap-1.5 text-[9.5px] uppercase tracking-wide px-2 border-none cursor-pointer"
                            >
                              <span className="text-blue-400 text-sm">G</span> Google
                            </button>
                            
                            {/* Apple Calendar export */}
                            <button
                              onClick={() => handleAddToAppleCalendar(opp)}
                              className="h-8 rounded-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-extrabold flex items-center justify-center gap-1.5 text-[9.5px] uppercase tracking-wide px-2 cursor-pointer"
                            >
                              <Download className="w-3 h-3 text-slate-600" /> Apple
                            </button>

                          </div>
                        </div>

                        {/* Feedback Banner */}
                        {syncFeedback[opp.id] && (
                          <div className="text-[10px] font-bold text-center py-2 px-3 rounded-sm bg-white/80 border border-slate-100">
                            {syncFeedback[opp.id] === 'linking' && (
                              <span className="text-[#1F4C63] animate-pulse">Requesting Google permission...</span>
                            )}
                            {syncFeedback[opp.id] === 'syncing' && (
                              <span className="text-[#1F4C63] animate-pulse">Synchronizing Google shift...</span>
                            )}
                            {syncFeedback[opp.id] === 'success-google' && (
                              <span className="text-emerald-600">✓ Added to Google Calendar!</span>
                            )}
                            {syncFeedback[opp.id] === 'success-apple' && (
                              <span className="text-emerald-600">✓ Shift downloaded for Apple!</span>
                            )}
                            {!['linking', 'syncing', 'success-google', 'success-apple'].includes(syncFeedback[opp.id]) && (
                              <div className="flex flex-col items-center gap-1.5 p-1">
                                <span className="text-red-500 font-extrabold flex items-center justify-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500" /> Google API restricted
                                </span>
                                <a
                                  href={getGoogleCalendarFallbackUrl(opp)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-white hover:text-white bg-[#1F4C63] hover:bg-[#1F4C63] px-3 py-1 rounded-sm text-[10px] font-black uppercase tracking-wider transition-colors inline-block no-underline"
                                >
                                  Add to Calendar (1-Click) 🚀
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] font-semibold text-slate-600 italic">No scheduled upcoming sessions for this date.</p>
                )}
              </div>

              {/* SECTION: Logged Core Activities */}
              <div>
                <h4 className="text-[10px] uppercase font-black tracking-widest text-slate-600 mb-3 block">Logged Credits</h4>
                {selectedDateLogs.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDateLogs.map((log: any) => (
                      <div key={log.id} className="p-4 rounded-sm bg-emerald-50/20 border border-emerald-100/50 space-y-2 relative animate-fadeIn">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-slate-900">{log.activity}</p>
                            <span className="text-[8.5px] text-slate-600 font-bold font-mono">ID: {log.id}</span>
                          </div>
                          <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 py-0.5 px-2 rounded-sm shrink-0">
                            {log.hours} hours
                          </span>
                        </div>

                        <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-600 font-semibold space-y-1">
                          <p className="flex items-center gap-1.5 leading-tight">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-sm" /> Supervisor: {log.coordinatorName}
                          </p>
                          {log.coordinatorContact && (
                            <p className="text-slate-600 text-[9.5px]">({log.coordinatorContact})</p>
                          )}
                          <p className="flex items-center gap-1.5 leading-tight pt-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#1F4C63]" />
                            <span className={cn(
                              "font-black tracking-widest uppercase text-[8px]",
                              log.approved ? "text-[#1F4C63]" : "text-[#E08A3C] animate-pulse"
                            )}>
                              {log.approved ? "Approved Volunteer Hours" : "Verification Outstanding"}
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] font-semibold text-slate-600 italic">No credit logging coordinates stored on this date.</p>
                )}
              </div>

            </div>

            <div className="pt-6 border-t border-slate-50 mt-6 shrink-0">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-sm text-center space-y-2">
                <p className="text-[10px] font-black uppercase text-slate-800 tracking-wider">
                  ⚠️ Direct Logging Restricted
                </p>
                <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                  Students are not permitted to self-report hours directly. Volunteer hours must be entered and verified exclusively by your organization's supervisor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
