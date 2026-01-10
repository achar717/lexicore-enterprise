// POST /api/upload - Upload file to R2 and create document in D1
interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid file type. Supported: PDF, PNG, JPG, WEBP' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate document ID and storage key
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const storageKey = `uploads/${documentId}/${file.name}`;

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await context.env.R2_BUCKET.put(storageKey, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Insert document record into D1
    const now = new Date().toISOString();
    await context.env.DB.prepare(`
      INSERT INTO documents (
        id,
        filename,
        original_filename,
        file_type,
        file_size_bytes,
        storage_key,
        upload_timestamp,
        processing_status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      documentId,
      file.name,
      file.name,
      file.type,
      file.size,
      storageKey,
      now,
      'uploaded',
      now
    ).run();

    const response = {
      documentId,
      filename: file.name,
      fileSize: file.size,
      fileType: file.type,
      storageKey,
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to upload file' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
