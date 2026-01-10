"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type Job, type JobResult } from '@/lib/api';

export const runtime = "edge";

export default function JobPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchJob = async () => {
      try {
        const jobData = await api.getJob(jobId);
        setJob(jobData);

        if (jobData.status === 'completed') {
          // Fetch result
          const resultData = await api.getResult(jobData.documentId);
          setResult(resultData);
          clearInterval(interval);
        } else if (jobData.status === 'failed') {
          setError(jobData.error || 'Job failed');
          clearInterval(interval);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch job');
        clearInterval(interval);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchJob();

    // Poll every 5 seconds if not completed
    interval = setInterval(() => {
      if (job?.status !== 'completed' && job?.status !== 'failed') {
        fetchJob();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  if (loading && !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading job...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Job Status
            </h1>
            <button
              onClick={() => router.push('/')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Back to Home
            </button>
          </div>

          {/* Job Info */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div>
              <p className="text-sm text-gray-500">Job ID</p>
              <p className="font-mono text-sm text-gray-900">{job?.id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Document ID</p>
              <p className="font-mono text-sm text-gray-900">{job?.documentId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <StatusBadge status={job?.status || 'pending'} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Progress</p>
              <p className="text-gray-900">{job?.progress || 0}%</p>
            </div>
          </div>

          {/* Progress Bar */}
          {job && (job.status === 'pending' || job.status === 'processing') && (
            <div className="mb-8">
              <div className="flex justify-between text-sm text-gray-700 mb-2">
                <span>Processing...</span>
                <span>
                  {job.currentPage && job.totalPages
                    ? `Page ${job.currentPage} of ${job.totalPages}`
                    : `${job.progress}%`}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-6">
              <div className="border-t pt-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  OCR Result
                </h2>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium">Total Pages</p>
                    <p className="text-2xl font-bold text-blue-900">{result.pages.length}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium">Word Count</p>
                    <p className="text-2xl font-bold text-green-900">{result.wordCount || 0}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-sm text-purple-600 font-medium">Confidence</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {result.confidence ? `${Math.round(result.confidence)}%` : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Full Text */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-medium text-gray-900 mb-2">Extracted Text</h3>
                  <div className="max-h-96 overflow-y-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                      {result.text}
                    </pre>
                  </div>
                </div>

                {/* Per-Page Results */}
                {result.pages.length > 1 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-4">Per-Page Results</h3>
                    <div className="space-y-4">
                      {result.pages.map((page) => (
                        <details
                          key={page.pageNumber}
                          className="bg-gray-50 rounded-lg p-4"
                        >
                          <summary className="cursor-pointer font-medium text-gray-900">
                            Page {page.pageNumber}
                            {page.confidence && (
                              <span className="ml-2 text-sm text-gray-600">
                                ({Math.round(page.confidence)}% confidence)
                              </span>
                            )}
                          </summary>
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                              {page.text}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || colors.pending}`}>
      {status}
    </span>
  );
}
