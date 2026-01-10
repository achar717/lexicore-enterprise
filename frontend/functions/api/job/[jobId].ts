// GET /api/job/[jobId] - Get job status
interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const jobId = context.params.jobId as string;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Query job from D1
    const result = await context.env.DB.prepare(`
      SELECT 
        id,
        document_id as documentId,
        status,
        progress,
        current_page as currentPage,
        total_pages as totalPages,
        created_at as createdAt,
        completed_at as completedAt,
        error_message as error
      FROM ocr_jobs
      WHERE id = ?
    `).bind(jobId).first();

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch job' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
