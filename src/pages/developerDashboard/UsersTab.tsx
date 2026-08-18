import { useState } from 'react';
import { Building2, Lock, ShieldAlert, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

/**
 * The user-management tab of the developer console: every student and
 * organization, with ban/unban and the two-step delete.
 *
 * Moved verbatim from DeveloperDashboard, where it was the largest inline
 * block (231 lines). Search and the two list toggles are local UI state and
 * live here; the delete confirmation, its error banner and both mutations
 * stay with the page, which owns the Firestore writes and the purge endpoint.
 */
export default function UsersTab({
  students,
  orgs,
  deleteTargetId,
  isUserDeletingId,
  setDeleteTargetId,
  developerDeleteError,
  setDeveloperDeleteError,
  onDeleteUser,
  onToggleBan,
}: {
  students: any[];
  orgs: any[];
  deleteTargetId: string | null;
  /** uid mid-purge, so both delete buttons can disable and label themselves. */
  isUserDeletingId: string | null;
  setDeleteTargetId: (id: string | null) => void;
  developerDeleteError: string | null;
  setDeveloperDeleteError: (message: string) => void;
  onDeleteUser: (uid: string, role: 'student' | 'organization') => void;
  onToggleBan: (uid: string, isCurrentlyBanned: boolean) => void;
}) {
  const [showStudentsList, setShowStudentsList] = useState(true);
  const [showOrgsList, setShowOrgsList] = useState(true);
  return (
        /* USER MANAGEMENT AUDIT TAB */
        <div className="space-y-4">
          {developerDeleteError && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-bold p-4 rounded-lg uppercase tracking-wider">
              {developerDeleteError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* STUDENTS CONTROL BLOCK */}
          <Card className="rounded-lg border border-line-light bg-white overflow-hidden flex flex-col">
            <CardHeader className="border-b border-slate-50 bg-paper-2/40 p-6 md:p-8">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink">
                <Users className="w-5 h-5 text-blue-dark" /> Students Audit Base
              </CardTitle>
              <p className="text-xs font-semibold text-ink-muted mt-1">
                Verify logged involvement parameters and privilege status.
              </p>
            </CardHeader>

            {!showStudentsList ? (
              <CardContent className="p-8 text-center space-y-4">
                <Lock className="w-8 h-8 text-ink-muted mx-auto" />
                <p className="text-xs text-ink-muted font-semibold">
                  Currently showing 0 students. Click the Students metric card above to query.
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white hover:bg-paper-2 text-xs font-semibold uppercase text-blue-dark"
                  onClick={() => setShowStudentsList(true)}
                >
                  Load Student List
                </Button>
              </CardContent>
            ) : (
              <CardContent className="p-0 divide-y divide-slate-50">
                {students.length === 0 ? (
                  <p className="text-center py-10 text-ink-muted text-xs font-bold">No registered student lists logs found.</p>
                ) : (
                  students.map((st) => (
                    <div key={st.uid} className="p-6 flex items-center justify-between gap-4 hover:bg-paper-2/20 transition-colors animate-fadeIn">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-ink">{st.fullName}</p>
                        <p className="text-xs text-ink-muted font-semibold font-mono">UID: {st.uid}</p>
                        <p className="text-xs font-bold text-ink-muted">
                          {st.school} • Grade {st.grade}
                        </p>
                        <p className="text-xs font-bold text-blue-dark font-mono">
                          {/* loggedHoursCount comes from the projection; the
                              array itself is no longer sent. Demo fixtures
                              still carry the array, hence both. */}
                          LOGGED: {st.loggedHoursCount ?? st.loggedHours?.length ?? 0} activity sessions
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {st.isBanned ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase text-red-600 bg-red-50 py-1.5 px-3 rounded-lg border border-red-100 inline-flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> suspended</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-white border-line hover:bg-paper-3 text-xs font-semibold uppercase"
                              onClick={() => onToggleBan(st.uid, true)}
                            >
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-red-100 text-xs font-semibold uppercase"
                            onClick={() => onToggleBan(st.uid, false)}
                          >
                            Suspend
                          </Button>
                        )}

                        {deleteTargetId !== st.uid ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-red-50/10 border-dashed border-red-200 hover:bg-red-50 text-red-600 font-semibold text-xs uppercase tracking-wider"
                            onClick={() => {
                              setDeleteTargetId(st.uid);
                              setDeveloperDeleteError('');
                            }}
                          >
                            Purge
                          </Button>
                        ) : (
                          <div className="flex flex-col items-end gap-1 p-2 bg-red-50 border border-red-200 rounded-lg animate-fadeIn">
                            <p className="text-xs text-red-700 font-bold">Purge doc data?</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setDeleteTargetId(null)}
                                className="text-xs text-ink-muted font-semibold uppercase hover:underline"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => onDeleteUser(st.uid, 'student')}
                                disabled={isUserDeletingId === st.uid}
                                className="text-xs text-red-600 font-bold uppercase hover:underline"
                              >
                                {isUserDeletingId === st.uid ? 'Purging...' : 'Purge!'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>

          {/* ORGANIZATIONS CONTROL BLOCK */}
          <Card className="rounded-lg border border-line-light bg-white overflow-hidden flex flex-col">
            <CardHeader className="border-b border-slate-50 bg-paper-2/40 p-6 md:p-8">
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-ink">
                <Building2 className="w-5 h-5 text-blue-dark" /> Organizations Audit Base
              </CardTitle>
              <p className="text-xs font-semibold text-ink-muted mt-1">
                Review verified public community service hubs around York region.
              </p>
            </CardHeader>

            {!showOrgsList ? (
              <CardContent className="p-8 text-center space-y-4">
                <Lock className="w-8 h-8 text-ink-muted mx-auto" />
                <p className="text-xs text-ink-muted font-semibold">
                  Currently showing 0 organizations. Click the Orgs metric card above to query.
                </p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white hover:bg-paper-2 text-xs font-semibold uppercase text-blue-dark"
                  onClick={() => setShowOrgsList(true)}
                >
                  Load Organizations List
                </Button>
              </CardContent>
            ) : (
              <CardContent className="p-0 divide-y divide-slate-50">
                {orgs.length === 0 ? (
                  <p className="text-center py-10 text-ink-muted text-xs font-bold">No organization registers found.</p>
                ) : (
                  orgs.map((org) => (
                    <div key={org.uid} className="p-6 flex items-center justify-between gap-4 hover:bg-paper-2/20 transition-colors animate-fadeIn">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-ink">{org.organizationName}</p>
                        <p className="text-xs text-ink-muted font-semibold font-mono">EMAIL: {org.contactEmail}</p>
                        <p className="text-xs font-bold text-ink-muted">
                          Type: {org.organizationType || 'Unassigned'}
                        </p>
                        {org.address && (
                          <p className="text-xs text-ink-muted italic">
                            HQ Address: {org.address}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {org.isBanned ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase text-red-600 bg-red-50 py-1.5 px-3 rounded-lg border border-red-100 inline-flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> suspended</span>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-white border-line hover:bg-paper-3 text-xs font-semibold uppercase"
                              onClick={() => onToggleBan(org.uid, true)}
                            >
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200 text-xs font-semibold uppercase border"
                            onClick={() => onToggleBan(org.uid, false)}
                          >
                            Suspend
                          </Button>
                        )}

                        {deleteTargetId !== org.uid ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-red-50/10 border-dashed border-red-200 hover:bg-red-50 text-red-600 font-semibold text-xs uppercase tracking-wider"
                            onClick={() => {
                              setDeleteTargetId(org.uid);
                              setDeveloperDeleteError('');
                            }}
                          >
                            Purge
                          </Button>
                        ) : (
                          <div className="flex flex-col items-end gap-1 p-2 bg-red-50 border border-red-200 rounded-lg animate-fadeIn">
                            <p className="text-xs text-red-700 font-bold">Purge doc data?</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setDeleteTargetId(null)}
                                className="text-xs text-ink-muted font-semibold uppercase hover:underline"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => onDeleteUser(org.uid, 'organization')}
                                disabled={isUserDeletingId === org.uid}
                                className="text-xs text-red-600 font-bold uppercase hover:underline"
                              >
                                {isUserDeletingId === org.uid ? 'Purging...' : 'Purge!'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
  );
}
