      {/* Premium Bento Cards Section - Using deep teal and amber */}
      <section className="py-24 sm:py-32 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-semibold text-primary-950 tracking-tight mb-4">
              Designed for <span className="font-display italic text-[#E08A3C]">impact</span>
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Everything you need to discover roles, track hours, and verify your contributions in one beautifully simple platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {/* Card 1: Community Hour Tracker */}
            <Interactive3DCard className="col-span-1 md:col-span-2 bg-[#1F4C63] rounded-3xl p-8 lg:p-10 text-white shadow-xl shadow-[#1F4C63]/10" spotlightColor="rgba(255, 255, 255, 0.1)">
              <div className="flex flex-col h-full justify-between min-h-[280px]">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold mb-6">
                    <TrendingUp className="w-3.5 h-3.5 text-[#E08A3C]" />
                    Real-time Tracking
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-semibold mb-3">Watch your hours grow.</h3>
                  <p className="text-blue-100/80 max-w-md text-sm leading-relaxed">
                    Automated hour logging directly tied to your OSSD requirements. Instantly export verified reports for your guidance counselor.
                  </p>
                </div>
                
                {/* Visual mockup element */}
                <div className="mt-8 bg-white/10 rounded-2xl p-6 border border-white/10 backdrop-blur-sm">
                  <div className="flex items-end gap-4">
                    <div className="text-4xl font-display text-white">24</div>
                    <div className="text-sm text-blue-200 mb-1">/ 40 hours completed</div>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full mt-4 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      whileInView={{ width: "60%" }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="bg-[#E08A3C] h-full rounded-full"
                    />
                  </div>
                </div>
              </div>
            </Interactive3DCard>

            {/* Card 2: AI Matching */}
            <Interactive3DCard className="col-span-1 bg-white rounded-3xl p-8 lg:p-10 border border-slate-200 shadow-xl shadow-slate-200/40" spotlightColor="rgba(224, 138, 60, 0.1)">
              <div className="flex flex-col h-full justify-between min-h-[280px]">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mb-6 border border-orange-100">
                    <Search className="w-6 h-6 text-[#E08A3C]" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Smart Matching</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    We match student interests, neighborhood locations, and high school schedules with real non-profit opportunities.
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  {['Tutoring', 'Food Bank', 'Park Cleanup'].map((tag) => (
                    <span key={tag} className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium border border-slate-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Interactive3DCard>

            {/* Card 3: Location Based */}
            <Interactive3DCard className="col-span-1 bg-gradient-to-br from-orange-50 to-white rounded-3xl p-8 lg:p-10 border border-orange-100/50 shadow-xl shadow-orange-100/40" spotlightColor="rgba(31, 76, 99, 0.05)">
              <div className="flex flex-col h-full justify-between min-h-[280px]">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                    <MapPin className="w-6 h-6 text-[#1F4C63]" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Stay Local</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Find high-impact roles just a bus ride away. Support the North York community where you actually live.
                  </p>
                </div>
              </div>
            </Interactive3DCard>

            {/* Card 4: Verified Partners */}
            <Interactive3DCard className="col-span-1 md:col-span-2 bg-[#FCFCFA] rounded-3xl p-8 lg:p-10 border border-slate-200 shadow-xl shadow-slate-200/40" spotlightColor="rgba(31, 76, 99, 0.05)">
              <div className="flex flex-col md:flex-row gap-8 items-center h-full">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[#1F4C63] text-xs font-semibold mb-6">
                    <Heart className="w-3.5 h-3.5" />
                    Trusted Organizations
                  </div>
                  <h3 className="text-2xl font-semibold text-slate-900 mb-3">Verified Non-profits</h3>
                  <p className="text-slate-600 text-sm leading-relaxed max-w-sm">
                    Every organization is vetted to ensure a safe, legitimate, and rewarding environment for high school students.
                  </p>
                </div>
                <div className="w-full md:w-auto grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 w-24 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center">
                      <div className="w-8 h-2 bg-slate-200 rounded-full opacity-50" />
                    </div>
                  ))}
                </div>
              </div>
            </Interactive3DCard>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-white relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-blue-50 to-orange-50 rounded-full blur-[100px] -z-10" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-primary-950 mb-6">
            Ready to make a difference?
          </h2>
          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
            Join thousands of North York students discovering their passion while completing their graduation requirements.
          </p>
          <Link to="/student/opportunities">
            <Button size="lg" className="h-14 px-10 text-[16px] bg-[#1F4C63] hover:bg-[#1F4C63]/90 text-white rounded-full shadow-lg shadow-[#1F4C63]/20">
              Start Volunteering Today <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
