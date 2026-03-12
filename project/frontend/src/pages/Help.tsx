import React, { useState } from 'react';
import { 
  HelpCircle, Book, Video, Mail, MessageSquare, ExternalLink, 
  Users, Activity, Play, Monitor, Download, Zap, 
  CheckCircle, AlertTriangle, Info, ChevronRight, Terminal,
  Folder, Image, Clock, Eye
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
    {
      icon: AlertTriangle,
      issue: 'Backend not connecting',
      solution: 'Ensure the backend server is running on port 8000. Run "cd backend && uvicorn server:app --reload" in terminal.',
      severity: 'warning'
    },
    {
      icon: Users,
      issue: 'Students showing as "Unknown"',
      solution: 'Add more reference images (5-10 per student) with varied angles and lighting. Ensure images are clear and show the full face.',
      severity: 'info'
    },
    {
      icon: Video,
      issue: 'Video not processing',
      solution: 'Check that input.mp4 exists in the project root. Ensure the video codec is compatible (H.264 recommended).',
      severity: 'warning'
    },
    {
      icon: Monitor,
      issue: 'Live feed showing black screen',
      solution: 'Wait for processing to complete. The video stream shows the annotated output after processing finishes.',
      severity: 'info'
    },
    {
      icon: Clock,
      issue: 'Processing stuck at 95%',
      solution: 'This is normal - the final phase involves saving results. Wait 10-15 seconds for completion.',
      severity: 'info'
    },
    {
      icon: Download,
      issue: 'Cannot export data',
      solution: 'Ensure processing has completed at least once. Check browser console for any API errors.',
      severity: 'warning'
    }
  ];

  const features = [
    {
      icon: Eye,
      title: 'Face Recognition',
      description: 'Multi-model AI pipeline with YOLO, MTCNN & FaceNet for 99%+ accuracy',
      color: 'blue'
    },
    {
      icon: Activity,
      title: 'Real-time Tracking',
      description: 'Live progress updates via WebSocket with frame-by-frame detection',
      color: 'green'
    },
    {
      icon: Zap,
      title: 'Smart Caching',
      description: 'Gallery embeddings cached for faster subsequent processing',
      color: 'yellow'
    },
    {
      icon: Download,
      title: 'Export Results',
      description: 'Download attendance data and processed video with annotations',
      color: 'purple'
    }
  ];

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <HelpCircle className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CORIS Help Center</h1>
              <p className="text-gray-600 dark:text-gray-300">Classroom Observation & Recognition Intelligence System</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
              v1.0.0
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('quickstart')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'quickstart'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Book className="w-4 h-4 inline mr-2" />
            Quick Start
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'faq'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4 inline mr-2" />
            FAQ
          </button>
          <button
            onClick={() => setActiveTab('troubleshoot')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'troubleshoot'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            Troubleshooting
          </button>
        </div>

        {/* Quick Start Content */}
        {activeTab === 'quickstart' && (
          <div className="p-6 space-y-6">
            {/* Steps */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                <Play className="w-5 h-5 mr-2 text-green-500" />
                Getting Started in 4 Steps
              </h3>
              
              <div className="grid gap-4">
                <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">1</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center">
                      <Folder className="w-4 h-4 mr-2 text-blue-500" />
                      Setup Student Gallery
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      Create folders in <code className="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">SI1/</code> with student names. Add 5-10 clear face photos per student.
                    </p>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 p-2 rounded">
                      SI1/<br/>
                      ├── Harsh/ (9 images)<br/>
                      ├── Harshal/ (8 images)<br/>
                      └── Vishal/ (9 images)
                    </div>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">2</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center">
                      <Video className="w-4 h-4 mr-2 text-blue-500" />
                      Add Input Video
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      Place your classroom video as <code className="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">input.mp4</code> in the project root directory.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">3</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center">
                      <Terminal className="w-4 h-4 mr-2 text-blue-500" />
                      Start the System
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      Run the backend server. Processing starts automatically.
                    </p>
                    <div className="mt-2 text-xs font-mono bg-gray-900 text-green-400 p-3 rounded">
                      <span className="text-gray-500">$</span> cd backend<br/>
                      <span className="text-gray-500">$</span> uvicorn server:app --reload --host 0.0.0.0 --port 8000
                    </div>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">4</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center">
                      <Monitor className="w-4 h-4 mr-2 text-green-500" />
                      View Live Analytics
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      Open <strong>Live Analytics</strong> to see real-time processing progress, detected students, and attendance results.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <Zap className="w-5 h-5 mr-2 text-yellow-500" />
                Key Features
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-start space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className={`p-2 rounded-lg ${colorClasses[feature.color]}`}>
                      <feature.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">{feature.title}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Image Guidelines */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 dark:text-blue-300 flex items-center mb-2">
                <Image className="w-4 h-4 mr-2" />
                Tips for Best Recognition Results
              </h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li className="flex items-center"><CheckCircle className="w-3 h-3 mr-2" /> Use clear, well-lit photos showing the full face</li>
                <li className="flex items-center"><CheckCircle className="w-3 h-3 mr-2" /> Include photos from different angles (front, slight left/right)</li>
                <li className="flex items-center"><CheckCircle className="w-3 h-3 mr-2" /> 5-10 images per student is optimal</li>
                <li className="flex items-center"><CheckCircle className="w-3 h-3 mr-2" /> Avoid blurry or heavily filtered images</li>
              </ul>
            </div>
          </div>
        )}

        {/* FAQ Content */}
        {activeTab === 'faq' && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {faqItems.map((item, index) => (
              <details key={index} className="group">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <span className="font-medium text-gray-900 dark:text-white pr-4">{item.question}</span>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-open:rotate-90 transition-transform flex-shrink-0" />
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
                className={`p-4 rounded-lg border ${
                  item.severity === 'warning' 
                    ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800' 
                    : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <item.icon className={`w-5 h-5 mt-0.5 ${
                    item.severity === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'
                  }`} />
                  <div>
                    <h4 className={`font-medium ${
                      item.severity === 'warning' ? 'text-yellow-800 dark:text-yellow-300' : 'text-blue-800 dark:text-blue-300'
                    }`}>
                      {item.issue}
                    </h4>
                    <p className={`text-sm mt-1 ${
                      item.severity === 'warning' ? 'text-yellow-700 dark:text-yellow-400' : 'text-blue-700 dark:text-blue-400'
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
      <div className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Info className="w-5 h-5 mr-2 text-gray-500" />
          Technology Stack
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">YOLOv8</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Face Detection</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">FaceNet</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Recognition</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">FastAPI</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Backend</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">React</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Frontend</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-sm p-6 text-white">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">CORIS - Classroom Observation & Recognition Intelligence System</h2>
            <p className="text-purple-100 text-sm">AI-powered attendance tracking for modern classrooms</p>
          </div>
          <div className="flex space-x-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>GitHub</span>
            </a>
            <a
              href="mailto:support@example.com"
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
