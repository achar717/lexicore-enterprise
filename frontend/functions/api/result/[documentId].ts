// GET /api/result/[documentId] - Get OCR result
interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const documentId = context.params.documentId as string;

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get job
    const job = await context.env.DB.prepare(`
      SELECT 
        id,
        document_id as documentId,
        status,
        extracted_text as text,
        confidence_score as confidence,
        word_count as wordCount
      FROM ocr_jobs
      WHERE document_id = ? AND status = 'completed'
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(documentId).first();

    if (!job) {
      return new Response(
        JSON.stringify({ error: 'No completed OCR job found for this document' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get per-page results
    const pagesResult = await context.env.DB.prepare(`
      SELECT 
        page_number as pageNumber,
        extracted_text as text,
        confidence_score as confidence
      FROM ocr_pages
      WHERE job_id = ?
      ORDER BY page_number ASC
    `).bind(job.id).all();

    const result = {
      id: job.id,
      documentId: job.documentId,
      text: job.text || '',
      pages: pagesResult.results || [],
      confidence: job.confidence,
      wordCount: job.wordCount,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching result:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch result' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
