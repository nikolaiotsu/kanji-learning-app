import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ValidateReceiptRequest {
  receiptData: string
  productId: string
}

interface AppleReceiptResponse {
  status: number
  environment?: string
  receipt?: {
    bundle_id: string
    in_app?: Array<{
      product_id: string
      original_transaction_id: string
      purchase_date_ms: string
      expires_date_ms?: string
      is_trial_period?: string
    }>
  }
  latest_receipt_info?: Array<{
    product_id: string
    original_transaction_id: string
    purchase_date_ms: string
    expires_date_ms: string
    is_trial_period: string
    auto_renew_status?: string
  }>
  pending_renewal_info?: Array<{
    auto_renew_status: string
    product_id: string
  }>
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
    const appleSharedSecret = Deno.env.get('APPLE_SHARED_SECRET')

    if (!appleSharedSecret) {
      console.error('APPLE_SHARED_SECRET not configured')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Environment variables present:', {
      supabaseUrl: !!supabaseUrl,
      serviceKey: !!supabaseServiceKey,
      appleSharedSecret: !!appleSharedSecret,
    })

    // Admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '')
    console.log('Token extracted, length:', token.length)

    // Verify the user's JWT token
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
    console.log(`Validating receipt for user: ${userId}`)

    // Parse request body
    const body: ValidateReceiptRequest = await req.json()
    const { receiptData, productId } = body

    if (!receiptData || !productId) {
      return new Response(
        JSON.stringify({ error: 'Missing receiptData or productId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Receipt validation request:', { productId, receiptDataLength: receiptData.length })

    // Function to validate with Apple
    async function validateWithApple(endpoint: string): Promise<AppleReceiptResponse> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receiptData,
          'password': appleSharedSecret,
          'exclude-old-transactions': true,
        }),
      })

      if (!response.ok) {
        throw new Error(`Apple API request failed: ${response.status}`)
      }

      return await response.json()
    }

    // Try production first, then sandbox (Apple's recommended approach)
    let appleResponse: AppleReceiptResponse
    try {
      console.log('Validating with Apple production endpoint...')
      appleResponse = await validateWithApple('https://buy.itunes.apple.com/verifyReceipt')
      
      // Status 21007 means the receipt is from sandbox, try sandbox endpoint
      if (appleResponse.status === 21007) {
        console.log('Receipt is from sandbox, retrying with sandbox endpoint...')
        appleResponse = await validateWithApple('https://sandbox.itunes.apple.com/verifyReceipt')
      }
    } catch (error) {
      console.error('Error validating with Apple:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to validate receipt with Apple',
          details: error instanceof Error ? error.message : String(error)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Apple validation response status:', appleResponse.status)

    // Check if validation was successful
    if (appleResponse.status !== 0) {
      const errorMessages: { [key: number]: string } = {
        21000: 'The App Store could not read the JSON object you provided.',
        21002: 'The data in the receipt-data property was malformed or missing.',
        21003: 'The receipt could not be authenticated.',
        21004: 'The shared secret you provided does not match the shared secret on file.',
        21005: 'The receipt server is not currently available.',
        21006: 'This receipt is valid but the subscription has expired.',
        21007: 'This receipt is from the test environment.',
        21008: 'This receipt is from the production environment.',
        21010: 'This receipt could not be authorized.',
      }

      const errorMessage = errorMessages[appleResponse.status] || 'Unknown error from Apple'
      console.error('Apple validation failed:', errorMessage)

      return new Response(
        JSON.stringify({ 
          error: 'Receipt validation failed',
          details: errorMessage,
          status: appleResponse.status
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse subscription info from Apple's response
    const latestReceiptInfo = appleResponse.latest_receipt_info || []
    const pendingRenewalInfo = appleResponse.pending_renewal_info || []

    // Find the subscription matching the product ID
    const subscription = latestReceiptInfo.find(item => item.product_id === productId)

    if (!subscription) {
      console.error('No subscription found for product:', productId)
      return new Response(
        JSON.stringify({ 
          error: 'No subscription found for this product',
          availableProducts: latestReceiptInfo.map(item => item.product_id)
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse subscription details
    const originalTransactionId = subscription.original_transaction_id
    const purchaseDate = new Date(parseInt(subscription.purchase_date_ms))
    const expiresDate = new Date(parseInt(subscription.expires_date_ms))
    const isActive = expiresDate > new Date()
    const isTrial = subscription.is_trial_period === 'true'
    
    // Get auto-renew status from pending renewal info
    const renewalInfo = pendingRenewalInfo.find(item => item.product_id === productId)
    const autoRenewStatus = renewalInfo?.auto_renew_status === '1'

    console.log('Parsed subscription info:', {
      originalTransactionId,
      purchaseDate,
      expiresDate,
      isActive,
      isTrial,
      autoRenewStatus,
    })

    // Store or update subscription in database
    const { data: dbSubscription, error: dbError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        product_id: productId,
        original_transaction_id: originalTransactionId,
        purchase_date: purchaseDate.toISOString(),
        expires_date: expiresDate.toISOString(),
        is_active: isActive,
        is_trial: isTrial,
        auto_renew_status: autoRenewStatus,
        receipt_data: receiptData,
        environment: appleResponse.environment || 'production',
        last_validated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error storing subscription in database:', dbError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to store subscription',
          details: dbError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Successfully validated and stored subscription')

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          productId,
          originalTransactionId,
          purchaseDate: purchaseDate.toISOString(),
          expiresDate: expiresDate.toISOString(),
          isActive,
          isTrial,
          autoRenewStatus,
          environment: appleResponse.environment || 'production',
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Unexpected error in validate-receipt function:', error)
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

