import { ArrowUpDown, Calendar, Clock, Download, Eye, Link2, Send, Trash2 } from "lucide-react";
import "./_group.css";

export function Responsive() {
  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] p-3 text-[#1A1A1A] sm:p-6">
      <header className="mb-5 flex items-center justify-between rounded-2xl border border-[#E5DDD2] bg-white p-4">
        <h1 className="font-cormorant text-2xl font-semibold">OAKS · Couples</h1>
        <span className="text-xs text-[#7A756D]">38 submissions</span>
      </header>
      <main className="mx-auto max-w-6xl space-y-4">
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[#E5DDD2] bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <input
            className="min-w-0 flex-1 rounded-xl border border-[#E8DFD3] bg-[#FAF8F5] px-3 py-2 text-sm"
            value="Search by couple names or #number..."
            readOnly
          />
          <div className="flex min-w-0 items-center gap-2 sm:justify-end">
            <ArrowUpDown className="h-4 w-4 shrink-0 text-[#7A756D]" />
            <select className="min-w-0 flex-1 rounded-xl border border-[#E8DFD3] bg-[#FAF8F5] px-3 py-2 text-xs sm:flex-none">
              <option>Sort: Newest submitted</option>
            </select>
          </div>
        </div>
        <article className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-[#E5DDD2] bg-white p-4 shadow-sm transition-all sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-x-5">
          <div className="flex min-w-0 items-start justify-between gap-3 xl:col-start-1 xl:row-start-1 xl:items-center">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <span className="shrink-0 rounded-lg border border-[#E8DFD3] bg-[#FAF7F2] px-2.5 py-1.5 font-mono text-xs font-bold text-[#8C7043]">
                #038
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words font-cormorant text-xl font-semibold leading-tight sm:text-2xl">
                    Ananya Chakraborty &amp; Alessandro Marchesi
                  </h2>
                  <span className="rounded-full border border-[#E5C388] bg-[#FFF9EE] px-2 py-0.5 text-[10px] font-semibold text-[#B08D57]">
                    Needs attention
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#7A756D]">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Submitted Nov 25</span>
                  <span>· ☎ +1 425 224 0777</span>
                </div>
              </div>
            </div>
            <select className="max-w-[6.5rem] shrink-0 rounded-full border border-[#E5C388] bg-[#FFF9EE] px-2 py-1 text-[11px] font-semibold text-[#B08D57] md:hidden">
              <option>New</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs xl:col-start-2 xl:row-start-1">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5DDD2] bg-[#FAF8F5] px-3 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#8C7043]" />2026-12-26
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">in 30 days</span>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 border-t border-[#F0EBE1] pt-3 sm:grid-cols-3 xl:col-span-2 xl:grid-cols-6 xl:pt-2">
            <select className="hidden min-h-10 w-full min-w-0 rounded-full border border-[#E5C388] bg-[#FFF9EE] px-3 py-1.5 text-xs font-semibold text-[#B08D57] md:block">
              <option>New</option>
            </select>
            <button className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#E5DDD2] bg-[#FAF8F5] px-2 py-2 text-xs font-semibold">
              <Eye className="h-3.5 w-3.5 shrink-0" />View
            </button>
            <button className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#E8DFD3] bg-white px-2 py-2 text-xs font-semibold text-[#8C7043]">
              <Download className="h-3.5 w-3.5 shrink-0" />Download
            </button>
            <button className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#E5DDD2] bg-[#FAF7F2] px-2 py-2 text-xs font-medium text-[#5C492A]" aria-label="Copy resume link">
              <Link2 className="h-3.5 w-3.5 shrink-0" /><span className="hidden lg:inline">Copy resume link</span><span className="lg:hidden">Copy link</span>
            </button>
            <button className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#E5DDD2] bg-[#FAF7F2] px-2 py-2 text-xs font-medium text-[#5C492A]" aria-label="Send link">
              <Send className="h-3.5 w-3.5 shrink-0" /><span>Send link</span>
            </button>
            <button className="col-span-2 inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-red-200/70 bg-red-50/70 px-2 py-2 text-xs font-medium text-red-600 sm:col-span-1" aria-label="Delete submission">
              <Trash2 className="h-3.5 w-3.5 shrink-0" /><span>Delete</span>
            </button>
          </div>
        </article>
      </main>
    </div>
  );
}
