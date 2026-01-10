// POST /api/jobs - Create OCR job
interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { documentId } = await context.request.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const jobId = `ocr_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    // Insert job into D1
    await context.env.DB.prepare(`
      INSERT INTO ocr_jobs (
        id, document_id, status, progress, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      jobId,
      documentId,
      'pending',
      0,
      now
    ).run();

    // Return job
    const job = {
      id: jobId,
      documentId,
      status: 'pending',
      progress: 0,
      createdAt: now,
    };

    return new Response(JSON.stringify(job), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating job:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create job' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
