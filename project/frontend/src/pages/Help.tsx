import React, { useState } from 'react';
import { 
  HelpCircle, Book, Video, Mail, MessageSquare, ExternalLink, 
  Users, Activity, Play, Monitor, Download, Zap, 
  CheckCircle, AlertTriangle, Info, ChevronRight, Terminal,
  Folder, Image, Clock, Eye, Sparkles,
} from 'lucide-react';

const Help: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'quickstart' | 'faq' | 'troubleshoot'>('quickstart');

  const faqItems = [
    {
      question: 'How does the face recognition work?',
      answer: 'CORIS uses a multi-model AI pipeline: YOLO v8 for fast face detection, MTCNN for precise face alignment, and FaceNet (InceptionResnetV1) for generating face embeddings. Students are identified by comparing their face embeddings against pre-computed gallery embeddings using cosine similarity.'
    },
    {
      question: 'What does the attendance percentage threshold mean?',
      answer: 'A student must be visible for at least 30% of the video duration OR 10 seconds to be marked as "Present". This prevents brief appearances from counting as attendance while ensuring students who arrive late are still recorded.'
    },
    {
      question: 'How do I add new students to the system?',
      answer: 'Create a folder with the student\'s name inside the SI1 directory (e.g., SI1/John_Doe/). Add 5-10 clear face photos of the student from different angles. The system will automatically include them on the next processing run.'
    },
    {
      question: 'Why is a student not being recognized?',
      answer: 'Common reasons: (1) Poor quality reference images - use clear, well-lit photos, (2) Significant appearance change - update gallery images, (3) Face obscured - glasses, masks, or extreme angles can affect recognition, (4) Low confidence threshold - the system requires 45%+ confidence to identify someone.'
    },
    {
      question: 'Can I use live webcam feeds?',
      answer: 'Currently, CORIS processes pre-recorded video files. Place your video as input.mp4 in the project root. The system will automatically start processing when the server launches.'
    },
    {
      question: 'How long does processing take?',
      answer: 'Processing time depends on video length and resolution. A typical 30-second classroom video processes in 1-2 minutes. The system uses caching to speed up subsequent runs with the same gallery.'
    },
    {
      question: 'What video formats are supported?',
      answer: 'MP4, AVI, MOV, MKV, and most common video formats are supported. For best results, use 720p or 1080p resolution with good lighting.'
    },
    {
      question: 'How is the confidence score calculated?',
      answer: 'Confidence is based on the cosine similarity between the detected face embedding and the gallery embeddings. Higher similarity (closer to 1.0) means higher confidence. The system shows average confidence across all detections.'
    }
  ];

  const troubleshootItems = [
    { icon: AlertTriangle, issue: 'Backend not connecting', solution: 'Ensure the backend server is running on port 8000. Run "cd backend && uvicorn server:app --reload" in terminal.', severity: 'warning' },
    { icon: Users, issue: 'Students showing as "Unknown"', solution: 'Add more reference images (5-10 per student) with varied angles and lighting. Ensure images are clear and show the full face.', severity: 'info' },
    { icon: Video, issue: 'Video not processing', solution: 'Check that input.mp4 exists in the project root. Ensure the video codec is compatible (H.264 recommended).', severity: 'warning' },
    { icon: Monitor, issue: 'Live feed showing black screen', solution: 'Wait for processing to complete. The video stream shows the annotated output after processing finishes.', severity: 'info' },
    { icon: Clock, issue: 'Processing stuck at 95%', solution: 'This is normal - the final phase involves saving results. Wait 10-15 seconds for completion.', severity: 'info' },
    { icon: Download, issue: 'Cannot export data', solution: 'Ensure processing has completed at least once. Check browser console for any API errors.', severity: 'warning' },
  ];

  const features = [
    { icon: Eye, title: 'Face Recognition', description: 'Multi-model AI pipeline with YOLO, MTCNN & FaceNet for 99%+ accuracy', gradient: 'from-blue-500 to-cyan-600' },
    { icon: Activity, title: 'Real-time Tracking', description: 'Live progress updates via WebSocket with frame-by-frame detection', gradient: 'from-emerald-500 to-teal-600' },
    { icon: Zap, title: 'Smart Caching', description: 'Gallery embeddings cached for faster subsequent processing', gradient: 'from-amber-500 to-orange-600' },
    { icon: Download, title: 'Export Results', description: 'Download attendance data and processed video with annotations', gradient: 'from-violet-500 to-purple-600' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <HelpCircle className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">CORIS Help Center</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Classroom Observation & Recognition Intelligence System</p>
            </div>
          </div>
          <span className="status-present text-xs font-bold">v1.0.0</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="glass-card overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {[
            { key: 'quickstart' as const, label: 'Quick Start', icon: Book },
            { key: 'faq' as const, label: 'FAQ', icon: MessageSquare },
            { key: 'troubleshoot' as const, label: 'Troubleshooting', icon: AlertTriangle },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === tab.key
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Quick Start Content */}
        {activeTab === 'quickstart' && (
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" />
                </div>
                Getting Started in 4 Steps
              </h3>
              
              <div className="grid gap-4">
                {[
                  { step: 1, icon: Folder, color: 'from-blue-500 to-cyan-600', title: 'Setup Student Gallery', desc: 'Create folders in SI1/ with student names. Add 5-10 clear face photos per student.', code: 'SI1/\n├── Harsh/ (9 images)\n├── Harshal/ (8 images)\n└── Vishal/ (9 images)' },
                  { step: 2, icon: Video, color: 'from-violet-500 to-purple-600', title: 'Add Input Video', desc: 'Place your classroom video as input.mp4 in the project root directory.' },
                  { step: 3, icon: Terminal, color: 'from-amber-500 to-orange-600', title: 'Start the System', desc: 'Run the backend server. Processing starts automatically.', terminal: '$ cd backend\n$ uvicorn server:app --reload --host 0.0.0.0 --port 8000' },
                  { step: 4, icon: Monitor, color: 'from-emerald-500 to-teal-600', title: 'View Live Analytics', desc: 'Open Live Analytics to see real-time processing progress and results.' },
                ].map(s => (
                  <div key={s.step} className="flex items-start gap-4 p-5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 hover:shadow-card transition-all">
                    <div className={'w-10 h-10 rounded-xl bg-gradient-to-br ' + s.color + ' flex items-center justify-center shadow-md flex-shrink-0'}>
                      <span className="text-white font-extrabold text-sm">{s.step}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <s.icon className="w-4 h-4 text-gray-400" />{s.title}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.desc}</p>
                      {s.code && (
                        <pre className="mt-2.5 text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600">{s.code}</pre>
                      )}
                      {s.terminal && (
                        <pre className="mt-2.5 text-xs font-mono bg-gray-900 text-emerald-400 p-3 rounded-xl border border-gray-700">{s.terminal}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Features Grid */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                Key Features
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {features.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 hover:shadow-card transition-all">
                    <div className={'w-10 h-10 rounded-xl bg-gradient-to-br ' + f.gradient + ' flex items-center justify-center shadow-md flex-shrink-0'}>
                      <f.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white">{f.title}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Image Guidelines */}
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/10 dark:to-cyan-900/10 border border-blue-200 dark:border-blue-800 p-5">
              <h4 className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2 mb-3">
                <Image className="w-4 h-4" />
                Tips for Best Recognition Results
              </h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
                {[
                  'Use clear, well-lit photos showing the full face',
                  'Include photos from different angles (front, slight left/right)',
                  '5-10 images per student is optimal',
                  'Avoid blurry or heavily filtered images',
                ].map((tip, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* FAQ Content */}
        {activeTab === 'faq' && (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {faqItems.map((item, index) => (
              <details key={index} className="group">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <span className="font-semibold text-gray-900 dark:text-white pr-4">{item.question}</span>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-open:rotate-90 transition-transform flex-shrink-0" />
                </summary>
                <div className="px-5 pb-5 text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* Troubleshooting Content */}
        {activeTab === 'troubleshoot' && (
          <div className="p-6 space-y-4">
            {troubleshootItems.map((item, index) => (
              <div 
                key={index} 
                className={`p-5 rounded-2xl border transition-all hover:shadow-card ${
                  item.severity === 'warning' 
                    ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' 
                    : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    item.severity === 'warning' ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-400 to-cyan-500'
                  }`}>
                    <item.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className={`font-bold ${
                      item.severity === 'warning' ? 'text-amber-800 dark:text-amber-300' : 'text-blue-800 dark:text-blue-300'
                    }`}>
                      {item.issue}
                    </h4>
                    <p className={`text-sm mt-1 ${
                      item.severity === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'
                    }`}>
                      <strong>Solution:</strong> {item.solution}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tech Stack */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
            <Info className="w-4 h-4 text-white" />
          </div>
          Technology Stack
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'YOLOv8', sub: 'Face Detection', gradient: 'from-blue-500 to-cyan-600' },
            { name: 'FaceNet', sub: 'Recognition', gradient: 'from-emerald-500 to-teal-600' },
            { name: 'FastAPI', sub: 'Backend', gradient: 'from-violet-500 to-purple-600' },
            { name: 'React', sub: 'Frontend', gradient: 'from-pink-500 to-rose-600' },
          ].map(t => (
            <div key={t.name} className="text-center p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 hover:shadow-card transition-all">
              <div className={'text-2xl font-extrabold bg-gradient-to-r ' + t.gradient + ' bg-clip-text text-transparent'}>{t.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">{t.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold mb-1">CORIS - Classroom Observation & Recognition Intelligence System</h2>
            <p className="text-purple-200 text-sm">AI-powered attendance tracking for modern classrooms</p>
          </div>
          <div className="flex space-x-3">
            <a
              href="https://github.com/Ramsaheb/ai-powered-classroom-monitoring-system-"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>GitHub</span>
            </a>
            <a
              href="mailto:ramsahebprasad1234@gmail.com"
              className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm"
            >
              <Mail className="w-4 h-4" />
              <span>Contact</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
