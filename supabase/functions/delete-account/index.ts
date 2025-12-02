import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteAccountRequest {
  userId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    console.log('Authorization header present:', !!authHeader)
    
    if (!authHeader) {
      console.error('No authorization header provided')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    console.log('Environment variables present:', {
      supabaseUrl: !!supabaseUrl,
      serviceKey: !!supabaseServiceKey,
      anonKey: !!supabaseAnonKey,
    })

    // Admin client with service role for deletion - use this for auth verification too
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '')
    console.log('Token extracted, length:', token.length)

    // Verify the user's JWT token using admin client
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token)

    console.log('Auth verification result:', {
      hasUser: !!user,
      userId: user?.id,
      error: authError?.message,
    })

    if (authError || !user) {
      console.error('Auth verification failed:', authError)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid authentication token',
          details: authError?.message 
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const userId = user.id
    console.log(`Starting account deletion for user: ${userId}`)

    // Step 1: Get all image URLs before deletion
    const { data: flashcards, error: fetchError } = await supabaseAdmin
      .from('flashcards')
      .select('image_url')
      .eq('user_id', userId)

    if (fetchError) {
      console.error('Error fetching flashcards:', fetchError)
      // Continue anyway - not critical
    }

    const imageUrls = flashcards?.map((f: any) => f.image_url).filter((url: string) => url) || []
    console.log(`Found ${imageUrls.length} images to delete`)

    // Step 2: Delete images from storage
    if (imageUrls.length > 0) {
      try {
        const filePaths = imageUrls.map((url: string) => {
          // Handle both public and signed URLs
          let fileName: string

          if (url.includes('flashcard-images/')) {
            const parts = url.split('flashcard-images/')
            if (parts.length > 1) {
              // Remove query parameters (from signed URLs)
              fileName = parts[1].split('?')[0]
            } else {
              // Fallback: use last part of URL
              const urlParts = url.split('/')
              fileName = urlParts[urlParts.length - 1].split('?')[0]
            }
          } else {
            // Fallback: use last part of URL
            const urlParts = url.split('/')
            fileName = urlParts[urlParts.length - 1].split('?')[0]
          }

          return `flashcard-images/${fileName}`
        })

        const { error: storageError } = await supabaseAdmin.storage
          .from('flashcards')
          .remove(filePaths)

        if (storageError) {
          console.error('Error deleting images from storage:', storageError)
          // Continue anyway - database cleanup is more important
        } else {
          console.log(`Successfully deleted ${filePaths.length} images from storage`)
        }
      } catch (error) {
        console.error('Error processing image deletion:', error)
        // Continue anyway
      }
    }

    // Step 3: Delete user account
    // This will cascade delete all database records due to ON DELETE CASCADE
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Error deleting user account:', deleteError)
      return new Response(
        JSON.stringify({
          error: 'Failed to delete user account',
          details: deleteError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(`Successfully deleted account for user: ${userId}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account and all associated data have been permanently deleted',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Unexpected error in delete-account function:', error)
    return new Response(
      JSON.stringify({
        error: 'An unexpected error occurred',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

