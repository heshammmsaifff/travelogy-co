export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          city: string | null
          code: string
          commercial_reg_no: string | null
          country_code: string
          created_at: string
          credit_limit: number
          currency_code: string
          email: string
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["agency_status"]
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          code: string
          commercial_reg_no?: string | null
          country_code: string
          created_at?: string
          credit_limit?: number
          currency_code?: string
          email: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          code?: string
          commercial_reg_no?: string | null
          country_code?: string
          created_at?: string
          credit_limit?: number
          currency_code?: string
          email?: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      agency_api_keys: {
        Row: {
          agency_id: string
          allowed_ips: string[] | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rate_limit_per_minute: number
        }
        Insert: {
          agency_id: string
          allowed_ips?: string[] | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          rate_limit_per_minute?: number
        }
        Update: {
          agency_id?: string
          allowed_ips?: string[] | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_minute?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_api_keys_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_supplier_preferences: {
        Row: {
          agency_id: string
          is_enabled: boolean
          supplier_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agency_id: string
          is_enabled?: boolean
          supplier_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agency_id?: string
          is_enabled?: boolean
          supplier_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_supplier_preferences_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      allocations: {
        Row: {
          allotment: number
          created_at: string
          id: string
          min_stay: number | null
          room_type_id: string
          sold: number
          stay_date: string
          stop_sell: boolean
          updated_at: string
        }
        Insert: {
          allotment?: number
          created_at?: string
          id?: string
          min_stay?: number | null
          room_type_id: string
          sold?: number
          stay_date: string
          stop_sell?: boolean
          updated_at?: string
        }
        Update: {
          allotment?: number
          created_at?: string
          id?: string
          min_stay?: number | null
          room_type_id?: string
          sold?: number
          stay_date?: string
          stop_sell?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      amenities: {
        Row: {
          category: string
          icon: string | null
          key: string
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          category: string
          icon?: string | null
          key: string
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          category?: string
          icon?: string | null
          key?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          cta_href: string | null
          cta_label_ar: string | null
          cta_label_en: string | null
          ends_at: string | null
          id: string
          image_public_id: string | null
          is_active: boolean
          sort_order: number
          starts_at: string | null
          subtitle_ar: string | null
          subtitle_en: string | null
          title_ar: string
          title_en: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          cta_href?: string | null
          cta_label_ar?: string | null
          cta_label_en?: string | null
          ends_at?: string | null
          id?: string
          image_public_id?: string | null
          is_active?: boolean
          sort_order?: number
          starts_at?: string | null
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar: string
          title_en: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          cta_href?: string | null
          cta_label_ar?: string | null
          cta_label_en?: string | null
          ends_at?: string | null
          id?: string
          image_public_id?: string | null
          is_active?: boolean
          sort_order?: number
          starts_at?: string | null
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string
          title_en?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banners_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_costs: {
        Row: {
          booking_id: string
          captured_at: string
          currency_code: string
          net_total: number
          sell_total: number
        }
        Insert: {
          booking_id: string
          captured_at?: string
          currency_code: string
          net_total: number
          sell_total: number
        }
        Update: {
          booking_id?: string
          captured_at?: string
          currency_code?: string
          net_total?: number
          sell_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_costs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          city_ar: string | null
          city_en: string | null
          country_code: string | null
          created_at: string
          currency_code: string
          hotel_id: string | null
          hotel_name_ar: string
          hotel_name_en: string
          id: string
          is_refundable: boolean
          meal_plan_key: string
          nights: number
          plan_name_ar: string
          plan_name_en: string
          rate_plan_id: string | null
          room_name_ar: string
          room_name_en: string
          room_type_id: string | null
          rooms: number
          sell_per_night: number
          sell_total: number
          star_rating: number | null
          supplier_key: string
        }
        Insert: {
          booking_id: string
          city_ar?: string | null
          city_en?: string | null
          country_code?: string | null
          created_at?: string
          currency_code: string
          hotel_id?: string | null
          hotel_name_ar: string
          hotel_name_en: string
          id?: string
          is_refundable?: boolean
          meal_plan_key: string
          nights: number
          plan_name_ar: string
          plan_name_en: string
          rate_plan_id?: string | null
          room_name_ar: string
          room_name_en: string
          room_type_id?: string | null
          rooms: number
          sell_per_night: number
          sell_total: number
          star_rating?: number | null
          supplier_key: string
        }
        Update: {
          booking_id?: string
          city_ar?: string | null
          city_en?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string
          hotel_id?: string | null
          hotel_name_ar?: string
          hotel_name_en?: string
          id?: string
          is_refundable?: boolean
          meal_plan_key?: string
          nights?: number
          plan_name_ar?: string
          plan_name_en?: string
          rate_plan_id?: string | null
          room_name_ar?: string
          room_name_en?: string
          room_type_id?: string | null
          rooms?: number
          sell_per_night?: number
          sell_total?: number
          star_rating?: number | null
          supplier_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          agency_code: string | null
          agency_id: string
          agency_name: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          check_in: string
          check_out: string
          children: number
          client_reference: string | null
          completed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          discount_amount: number
          id: string
          lead_guest_email: string | null
          lead_guest_name: string
          lead_guest_phone: string | null
          nights: number
          product_type: Database["public"]["Enums"]["product_type"]
          promo_code: string | null
          quotation_id: string | null
          reference: string
          rooms: number
          special_requests: string | null
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_sell: number
          tax_amount: number
          tax_rate_percent: number
          total_sell: number
          updated_at: string
        }
        Insert: {
          adults: number
          agency_code?: string | null
          agency_id: string
          agency_name?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          check_in: string
          check_out: string
          children?: number
          client_reference?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency_code: string
          discount_amount?: number
          id?: string
          lead_guest_email?: string | null
          lead_guest_name: string
          lead_guest_phone?: string | null
          nights: number
          product_type?: Database["public"]["Enums"]["product_type"]
          promo_code?: string | null
          quotation_id?: string | null
          reference: string
          rooms: number
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal_sell?: number
          tax_amount?: number
          tax_rate_percent?: number
          total_sell: number
          updated_at?: string
        }
        Update: {
          adults?: number
          agency_code?: string | null
          agency_id?: string
          agency_name?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          check_in?: string
          check_out?: string
          children?: number
          client_reference?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          discount_amount?: number
          id?: string
          lead_guest_email?: string | null
          lead_guest_name?: string
          lead_guest_phone?: string | null
          nights?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          promo_code?: string | null
          quotation_id?: string | null
          reference?: string
          rooms?: number
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal_sell?: number
          tax_amount?: number
          tax_rate_percent?: number
          total_sell?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_policies: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          hotel_id: string | null
          id: string
          is_non_refundable: boolean
          name_ar: string
          name_en: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          hotel_id?: string | null
          id?: string
          is_non_refundable?: boolean
          name_ar: string
          name_en: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          hotel_id?: string | null
          id?: string
          is_non_refundable?: boolean
          name_ar?: string
          name_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_policies_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_rules: {
        Row: {
          charge_type: Database["public"]["Enums"]["charge_type"]
          charge_value: number
          created_at: string
          hours_before_checkin: number
          id: string
          policy_id: string
        }
        Insert: {
          charge_type: Database["public"]["Enums"]["charge_type"]
          charge_value: number
          created_at?: string
          hours_before_checkin: number
          id?: string
          policy_id: string
        }
        Update: {
          charge_type?: Database["public"]["Enums"]["charge_type"]
          charge_value?: number
          created_at?: string
          hours_before_checkin?: number
          id?: string
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_rules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      child_policies: {
        Row: {
          age_from: number
          age_to: number
          charge_type: Database["public"]["Enums"]["charge_type"]
          charge_value: number
          created_at: string
          hotel_id: string
          id: string
        }
        Insert: {
          age_from: number
          age_to: number
          charge_type?: Database["public"]["Enums"]["charge_type"]
          charge_value?: number
          created_at?: string
          hotel_id: string
          id?: string
        }
        Update: {
          age_from?: number
          age_to?: number
          charge_type?: Database["public"]["Enums"]["charge_type"]
          charge_value?: number
          created_at?: string
          hotel_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_policies_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      company_profile: {
        Row: {
          address_ar: string | null
          address_en: string | null
          commercial_reg_no: string | null
          email: string | null
          id: boolean
          invoice_footer_ar: string | null
          invoice_footer_en: string | null
          legal_name_ar: string
          legal_name_en: string
          logo_public_id: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          commercial_reg_no?: string | null
          email?: string | null
          id?: boolean
          invoice_footer_ar?: string | null
          invoice_footer_en?: string | null
          legal_name_ar?: string
          legal_name_en?: string
          logo_public_id?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          commercial_reg_no?: string | null
          email?: string | null
          id?: boolean
          invoice_footer_ar?: string | null
          invoice_footer_en?: string | null
          legal_name_ar?: string
          legal_name_en?: string
          logo_public_id?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profile_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pages: {
        Row: {
          body_ar: string
          body_en: string
          slug: string
          title_ar: string
          title_en: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_ar: string
          body_en: string
          slug: string
          title_ar: string
          title_en: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_ar?: string
          body_en?: string
          slug?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          agency_id: string | null
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          lead_id: string | null
          occurred_at: string
          subject: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          lead_id?: string | null
          occurred_at?: string
          subject: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          lead_id?: string | null
          occurred_at?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          agency_id: string | null
          city: string | null
          company_name: string
          contact_name: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          reference: string
          source: Database["public"]["Enums"]["lead_source"]
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
          won_agency_code: string | null
          won_agency_name: string | null
        }
        Insert: {
          agency_id?: string | null
          city?: string | null
          company_name: string
          contact_name?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          reference?: string
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          won_agency_code?: string | null
          won_agency_name?: string | null
        }
        Update: {
          agency_id?: string | null
          city?: string | null
          company_name?: string
          contact_name?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          reference?: string
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          won_agency_code?: string | null
          won_agency_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          agency_id: string | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          lead_id: string | null
          notes: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          decimals: number
          is_active: boolean
          is_base: boolean
          name_ar: string
          name_en: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          decimals?: number
          is_active?: boolean
          is_base?: boolean
          name_ar: string
          name_en: string
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          decimals?: number
          is_active?: boolean
          is_base?: boolean
          name_ar?: string
          name_en?: string
          symbol?: string
        }
        Relationships: []
      }
      driver_assignments: {
        Row: {
          arrived_at: string | null
          assigned_at: string
          assigned_by: string | null
          completed_at: string | null
          created_at: string
          driver_id: string
          driver_notes: string | null
          id: string
          job_date: string
          picked_up_at: string | null
          pickup_time: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          transfer_item_id: string
          updated_at: string
          vehicle_seq: number
        }
        Insert: {
          arrived_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          driver_id: string
          driver_notes?: string | null
          id?: string
          job_date: string
          picked_up_at?: string | null
          pickup_time?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          transfer_item_id: string
          updated_at?: string
          vehicle_seq: number
        }
        Update: {
          arrived_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          driver_id?: string
          driver_notes?: string | null
          id?: string
          job_date?: string
          picked_up_at?: string | null
          pickup_time?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          transfer_item_id?: string
          updated_at?: string
          vehicle_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_transfer_item_id_fkey"
            columns: ["transfer_item_id"]
            isOneToOne: false
            referencedRelation: "transfer_items"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          code: string
          created_at: string
          default_vehicle_type_id: string | null
          id: string
          is_active: boolean
          licence_expiry: string | null
          licence_number: string | null
          notes: string | null
          phone: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_vehicle_type_id?: string | null
          id?: string
          is_active?: boolean
          licence_expiry?: string | null
          licence_number?: string | null
          notes?: string | null
          phone: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_vehicle_type_id?: string | null
          id?: string
          is_active?: boolean
          licence_expiry?: string | null
          licence_number?: string | null
          notes?: string | null
          phone?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_default_vehicle_type_id_fkey"
            columns: ["default_vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          id: string
          rate_to_base: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_code: string
          effective_from: string
          id?: string
          rate_to_base: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          id?: string
          rate_to_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_rates_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      homepage_content: {
        Row: {
          cta_body_ar: string
          cta_body_en: string
          cta_button_ar: string
          cta_button_en: string
          cta_title_ar: string
          cta_title_en: string
          features: Json
          features_subtitle_ar: string
          features_subtitle_en: string
          features_title_ar: string
          features_title_en: string
          hero_eyebrow_ar: string
          hero_eyebrow_en: string
          hero_subtitle_ar: string
          hero_subtitle_en: string
          hero_title_ar: string
          hero_title_en: string
          how_steps: Json
          how_title_ar: string
          how_title_en: string
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cta_body_ar?: string
          cta_body_en?: string
          cta_button_ar?: string
          cta_button_en?: string
          cta_title_ar?: string
          cta_title_en?: string
          features?: Json
          features_subtitle_ar?: string
          features_subtitle_en?: string
          features_title_ar?: string
          features_title_en?: string
          hero_eyebrow_ar?: string
          hero_eyebrow_en?: string
          hero_subtitle_ar?: string
          hero_subtitle_en?: string
          hero_title_ar?: string
          hero_title_en?: string
          how_steps?: Json
          how_title_ar?: string
          how_title_en?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cta_body_ar?: string
          cta_body_en?: string
          cta_button_ar?: string
          cta_button_en?: string
          cta_title_ar?: string
          cta_title_en?: string
          features?: Json
          features_subtitle_ar?: string
          features_subtitle_en?: string
          features_title_ar?: string
          features_title_en?: string
          hero_eyebrow_ar?: string
          hero_eyebrow_en?: string
          hero_subtitle_ar?: string
          hero_subtitle_en?: string
          hero_title_ar?: string
          hero_title_en?: string
          how_steps?: Json
          how_title_ar?: string
          how_title_en?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homepage_content_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_amenities: {
        Row: {
          amenity_key: string
          hotel_id: string
        }
        Insert: {
          amenity_key: string
          hotel_id: string
        }
        Update: {
          amenity_key?: string
          hotel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_amenities_amenity_key_fkey"
            columns: ["amenity_key"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "hotel_amenities_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_images: {
        Row: {
          alt_ar: string | null
          alt_en: string | null
          bytes: number | null
          cloudinary_public_id: string
          created_at: string
          height: number | null
          hotel_id: string
          id: string
          is_cover: boolean
          room_type_id: string | null
          secure_url: string
          sort_order: number
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_ar?: string | null
          alt_en?: string | null
          bytes?: number | null
          cloudinary_public_id: string
          created_at?: string
          height?: number | null
          hotel_id: string
          id?: string
          is_cover?: boolean
          room_type_id?: string | null
          secure_url: string
          sort_order?: number
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_ar?: string | null
          alt_en?: string | null
          bytes?: number | null
          cloudinary_public_id?: string
          created_at?: string
          height?: number | null
          hotel_id?: string
          id?: string
          is_cover?: boolean
          room_type_id?: string | null
          secure_url?: string
          sort_order?: number
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_images_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_images_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_supplier_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          hotel_id: string
          id: string
          supplier_hotel_name: string | null
          supplier_hotel_ref: string
          supplier_key: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hotel_id: string
          id?: string
          supplier_hotel_name?: string | null
          supplier_hotel_ref: string
          supplier_key: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hotel_id?: string
          id?: string
          supplier_hotel_name?: string | null
          supplier_hotel_ref?: string
          supplier_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_supplier_mappings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          address_ar: string | null
          address_en: string | null
          area_ar: string | null
          area_en: string | null
          check_in_time: string
          check_out_time: string
          city_ar: string
          city_en: string
          code: string
          country_code: string
          created_at: string
          created_by: string | null
          description_ar: string | null
          description_en: string | null
          email: string | null
          id: string
          internal_notes: string | null
          latitude: number | null
          location_url: string | null
          longitude: number | null
          name_ar: string
          name_en: string
          phone: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          star_rating: number | null
          status: Database["public"]["Enums"]["hotel_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          area_ar?: string | null
          area_en?: string | null
          check_in_time?: string
          check_out_time?: string
          city_ar: string
          city_en: string
          code: string
          country_code: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          location_url?: string | null
          longitude?: number | null
          name_ar: string
          name_en: string
          phone?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          star_rating?: number | null
          status?: Database["public"]["Enums"]["hotel_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          area_ar?: string | null
          area_en?: string | null
          check_in_time?: string
          check_out_time?: string
          city_ar?: string
          city_en?: string
          code?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          location_url?: string | null
          longitude?: number | null
          name_ar?: string
          name_en?: string
          phone?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          star_rating?: number | null
          status?: Database["public"]["Enums"]["hotel_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      markup_rules: {
        Row: {
          agency_id: string | null
          created_at: string
          created_by: string | null
          hotel_id: string | null
          id: string
          is_active: boolean
          markup_type: Database["public"]["Enums"]["charge_type"]
          markup_value: number
          note: string | null
          scope: Database["public"]["Enums"]["markup_scope"]
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          created_by?: string | null
          hotel_id?: string | null
          id?: string
          is_active?: boolean
          markup_type?: Database["public"]["Enums"]["charge_type"]
          markup_value: number
          note?: string | null
          scope: Database["public"]["Enums"]["markup_scope"]
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          created_by?: string | null
          hotel_id?: string | null
          id?: string
          is_active?: boolean
          markup_type?: Database["public"]["Enums"]["charge_type"]
          markup_value?: number
          note?: string | null
          scope?: Database["public"]["Enums"]["markup_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "markup_rules_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markup_rules_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          description_ar: string | null
          description_en: string | null
          key: string
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          description_ar?: string | null
          description_en?: string | null
          key: string
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          description_ar?: string | null
          description_en?: string | null
          key?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      offer_rate_plans: {
        Row: {
          offer_id: string
          rate_plan_id: string
        }
        Insert: {
          offer_id: string
          rate_plan_id: string
        }
        Update: {
          offer_id?: string
          rate_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_rate_plans_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_rate_plans_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_room_types: {
        Row: {
          offer_id: string
          room_type_id: string
        }
        Insert: {
          offer_id: string
          room_type_id: string
        }
        Update: {
          offer_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_room_types_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_room_types_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          booking_window: unknown
          created_at: string
          description_ar: string | null
          description_en: string | null
          discount_type: Database["public"]["Enums"]["charge_type"]
          discount_value: number
          free_nights: number | null
          hotel_id: string
          id: string
          is_active: boolean
          min_nights: number | null
          name_ar: string
          name_en: string
          offer_type: Database["public"]["Enums"]["offer_type"]
          sort_order: number
          stay_window: unknown
          updated_at: string
        }
        Insert: {
          booking_window?: unknown
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          discount_type?: Database["public"]["Enums"]["charge_type"]
          discount_value: number
          free_nights?: number | null
          hotel_id: string
          id?: string
          is_active?: boolean
          min_nights?: number | null
          name_ar: string
          name_en: string
          offer_type: Database["public"]["Enums"]["offer_type"]
          sort_order?: number
          stay_window: unknown
          updated_at?: string
        }
        Update: {
          booking_window?: unknown
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          discount_type?: Database["public"]["Enums"]["charge_type"]
          discount_value?: number
          free_nights?: number | null
          hotel_id?: string
          id?: string
          is_active?: boolean
          min_nights?: number | null
          name_ar?: string
          name_en?: string
          offer_type?: Database["public"]["Enums"]["offer_type"]
          sort_order?: number
          stay_window?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      package_days: {
        Row: {
          body_ar: string | null
          body_en: string | null
          created_at: string
          day_number: number
          id: string
          package_id: string
          title_ar: string
          title_en: string
          updated_at: string
        }
        Insert: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          day_number: number
          id?: string
          package_id: string
          title_ar: string
          title_en: string
          updated_at?: string
        }
        Update: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          day_number?: number
          id?: string
          package_id?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_days_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_departures: {
        Row: {
          capacity: number
          created_at: string
          departure_date: string
          id: string
          is_closed: boolean
          notes: string | null
          package_id: string
          return_date: string
          seats_sold: number
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          departure_date: string
          id?: string
          is_closed?: boolean
          notes?: string | null
          package_id: string
          return_date: string
          seats_sold?: number
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          departure_date?: string
          id?: string
          is_closed?: boolean
          notes?: string | null
          package_id?: string
          return_date?: string
          seats_sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_departures_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_items: {
        Row: {
          booking_id: string
          city_ar: string | null
          city_en: string | null
          country_code: string | null
          created_at: string
          currency_code: string
          departure_date: string
          departure_id: string | null
          duration_nights: number
          id: string
          name_ar: string
          name_en: string
          occupancy: Database["public"]["Enums"]["package_occupancy"]
          package_code: string
          package_id: string | null
          return_date: string
          sell_per_person: number
          sell_total: number
          travellers: number
        }
        Insert: {
          booking_id: string
          city_ar?: string | null
          city_en?: string | null
          country_code?: string | null
          created_at?: string
          currency_code: string
          departure_date: string
          departure_id?: string | null
          duration_nights: number
          id?: string
          name_ar: string
          name_en: string
          occupancy: Database["public"]["Enums"]["package_occupancy"]
          package_code: string
          package_id?: string | null
          return_date: string
          sell_per_person: number
          sell_total: number
          travellers: number
        }
        Update: {
          booking_id?: string
          city_ar?: string | null
          city_en?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string
          departure_date?: string
          departure_id?: string | null
          duration_nights?: number
          id?: string
          name_ar?: string
          name_en?: string
          occupancy?: Database["public"]["Enums"]["package_occupancy"]
          package_code?: string
          package_id?: string | null
          return_date?: string
          sell_per_person?: number
          sell_total?: number
          travellers?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_items_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "package_departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_rates: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          is_closed: boolean
          net_per_person: number
          occupancy: Database["public"]["Enums"]["package_occupancy"]
          package_id: string
          updated_at: string
          valid_period: unknown
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          is_closed?: boolean
          net_per_person: number
          occupancy: Database["public"]["Enums"]["package_occupancy"]
          package_id: string
          updated_at?: string
          valid_period: unknown
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          is_closed?: boolean
          net_per_person?: number
          occupancy?: Database["public"]["Enums"]["package_occupancy"]
          package_id?: string
          updated_at?: string
          valid_period?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "package_rates_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          city_ar: string
          city_en: string
          code: string
          country_code: string
          cover_image_public_id: string | null
          created_at: string
          duration_nights: number
          exclusions_ar: string | null
          exclusions_en: string | null
          id: string
          inclusions_ar: string | null
          inclusions_en: string | null
          name_ar: string
          name_en: string
          status: Database["public"]["Enums"]["package_status"]
          summary_ar: string | null
          summary_en: string | null
          updated_at: string
        }
        Insert: {
          city_ar: string
          city_en: string
          code: string
          country_code: string
          cover_image_public_id?: string | null
          created_at?: string
          duration_nights: number
          exclusions_ar?: string | null
          exclusions_en?: string | null
          id?: string
          inclusions_ar?: string | null
          inclusions_en?: string | null
          name_ar: string
          name_en: string
          status?: Database["public"]["Enums"]["package_status"]
          summary_ar?: string | null
          summary_en?: string | null
          updated_at?: string
        }
        Update: {
          city_ar?: string
          city_en?: string
          code?: string
          country_code?: string
          cover_image_public_id?: string | null
          created_at?: string
          duration_nights?: number
          exclusions_ar?: string | null
          exclusions_en?: string | null
          id?: string
          inclusions_ar?: string | null
          inclusions_en?: string | null
          name_ar?: string
          name_en?: string
          status?: Database["public"]["Enums"]["package_status"]
          summary_ar?: string | null
          summary_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          agency_id: string
          amount: number
          created_at: string
          currency_code: string
          external_reference: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_on: string
          recorded_by: string | null
          reference: string
        }
        Insert: {
          agency_id: string
          amount: number
          created_at?: string
          currency_code: string
          external_reference?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on: string
          recorded_by?: string | null
          reference: string
        }
        Update: {
          agency_id?: string
          amount?: number
          created_at?: string
          currency_code?: string
          external_reference?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          recorded_by?: string | null
          reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          key: string
          module: string
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          key: string
          module: string
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          key?: string
          module?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agency_id: string | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          must_change_password: boolean
          phone: string | null
          preferred_locale: string
          role_id: string
          status: Database["public"]["Enums"]["user_status"]
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          must_change_password?: boolean
          phone?: string | null
          preferred_locale?: string
          role_id: string
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
          phone?: string | null
          preferred_locale?: string
          role_id?: string
          status?: Database["public"]["Enums"]["user_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_redemptions: {
        Row: {
          agency_id: string
          booking_id: string
          discount_amount: number
          id: string
          promo_code_id: string
          redeemed_at: string
        }
        Insert: {
          agency_id: string
          booking_id: string
          discount_amount: number
          id?: string
          promo_code_id: string
          redeemed_at?: string
        }
        Update: {
          agency_id?: string
          booking_id?: string
          discount_amount?: number
          id?: string
          promo_code_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_redemptions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          agency_id: string | null
          code: string
          created_at: string
          created_by: string | null
          discount_type: Database["public"]["Enums"]["charge_type"]
          discount_value: number
          id: string
          is_active: boolean
          max_discount: number | null
          max_per_agency: number | null
          max_redemptions: number | null
          min_booking_total: number | null
          name_ar: string
          name_en: string
          times_used: number
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          agency_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["charge_type"]
          discount_value: number
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_per_agency?: number | null
          max_redemptions?: number | null
          min_booking_total?: number | null
          name_ar: string
          name_en: string
          times_used?: number
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          agency_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["charge_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_per_agency?: number | null
          max_redemptions?: number | null
          min_booking_total?: number | null
          name_ar?: string
          name_en?: string
          times_used?: number
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          captured_at: string
          city_ar: string | null
          city_en: string | null
          country_code: string | null
          cover_url: string | null
          currency_code: string
          hotel_name_ar: string
          hotel_name_en: string
          hotel_ref: string
          id: string
          is_refundable: boolean
          meal_plan_key: string
          nights: number
          offer_ref: string
          plan_name_ar: string
          plan_name_en: string
          quotation_id: string
          rate_plan_ref: string
          room_name_ar: string
          room_name_en: string
          room_ref: string
          rooms: number
          sell_per_night: number
          sell_total: number
          sort_order: number
          star_rating: number | null
          supplier_key: string
        }
        Insert: {
          captured_at?: string
          city_ar?: string | null
          city_en?: string | null
          country_code?: string | null
          cover_url?: string | null
          currency_code: string
          hotel_name_ar: string
          hotel_name_en: string
          hotel_ref: string
          id?: string
          is_refundable?: boolean
          meal_plan_key: string
          nights: number
          offer_ref: string
          plan_name_ar: string
          plan_name_en: string
          quotation_id: string
          rate_plan_ref: string
          room_name_ar: string
          room_name_en: string
          room_ref: string
          rooms?: number
          sell_per_night: number
          sell_total: number
          sort_order?: number
          star_rating?: number | null
          supplier_key: string
        }
        Update: {
          captured_at?: string
          city_ar?: string | null
          city_en?: string | null
          country_code?: string | null
          cover_url?: string | null
          currency_code?: string
          hotel_name_ar?: string
          hotel_name_en?: string
          hotel_ref?: string
          id?: string
          is_refundable?: boolean
          meal_plan_key?: string
          nights?: number
          offer_ref?: string
          plan_name_ar?: string
          plan_name_en?: string
          quotation_id?: string
          rate_plan_ref?: string
          room_name_ar?: string
          room_name_en?: string
          room_ref?: string
          rooms?: number
          sell_per_night?: number
          sell_total?: number
          sort_order?: number
          star_rating?: number | null
          supplier_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          adults: number
          agency_id: string
          check_in: string
          check_out: string
          children: number
          created_at: string
          created_by: string | null
          currency_code: string
          guest_name: string | null
          id: string
          notes: string | null
          reference: string
          rooms: number
          status: Database["public"]["Enums"]["quotation_status"]
          title: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          adults?: number
          agency_id: string
          check_in: string
          check_out: string
          children?: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          guest_name?: string | null
          id?: string
          notes?: string | null
          reference: string
          rooms?: number
          status?: Database["public"]["Enums"]["quotation_status"]
          title?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          adults?: number
          agency_id?: string
          check_in?: string
          check_out?: string
          children?: number
          created_at?: string
          created_by?: string | null
          currency_code?: string
          guest_name?: string | null
          id?: string
          notes?: string | null
          reference?: string
          rooms?: number
          status?: Database["public"]["Enums"]["quotation_status"]
          title?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_plans: {
        Row: {
          cancellation_policy_id: string | null
          code: string
          created_at: string
          currency_code: string
          hotel_id: string
          id: string
          meal_plan_key: string
          name_ar: string
          name_en: string
          status: Database["public"]["Enums"]["rate_plan_status"]
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          cancellation_policy_id?: string | null
          code: string
          created_at?: string
          currency_code?: string
          hotel_id: string
          id?: string
          meal_plan_key: string
          name_ar: string
          name_en: string
          status?: Database["public"]["Enums"]["rate_plan_status"]
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          cancellation_policy_id?: string | null
          code?: string
          created_at?: string
          currency_code?: string
          hotel_id?: string
          id?: string
          meal_plan_key?: string
          name_ar?: string
          name_en?: string
          status?: Database["public"]["Enums"]["rate_plan_status"]
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_plans_cancellation_policy_id_fkey"
            columns: ["cancellation_policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_meal_plan_key_fkey"
            columns: ["meal_plan_key"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["key"]
          },
        ]
      }
      rates: {
        Row: {
          created_at: string
          extra_adult_price: number
          extra_child_price: number
          id: string
          is_closed: boolean
          max_stay: number | null
          min_stay: number
          price_per_night: number
          rate_plan_id: string
          room_type_id: string
          single_occupancy_price: number | null
          stay_period: unknown
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra_adult_price?: number
          extra_child_price?: number
          id?: string
          is_closed?: boolean
          max_stay?: number | null
          min_stay?: number
          price_per_night: number
          rate_plan_id: string
          room_type_id: string
          single_occupancy_price?: number | null
          stay_period: unknown
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra_adult_price?: number
          extra_child_price?: number
          id?: string
          is_closed?: boolean
          max_stay?: number | null
          min_stay?: number
          price_per_night?: number
          rate_plan_id?: string
          room_type_id?: string
          single_occupancy_price?: number | null
          stay_period?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rates_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rates_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          permission_key: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          permission_key: string
          role_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_system: boolean
          key: string
          name_ar: string
          name_en: string
          scope: Database["public"]["Enums"]["role_scope"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_system?: boolean
          key: string
          name_ar: string
          name_en: string
          scope: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name_ar?: string
          name_en?: string
          scope?: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Relationships: []
      }
      room_types: {
        Row: {
          bed_configuration_ar: string | null
          bed_configuration_en: string | null
          code: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          hotel_id: string
          id: string
          max_adults: number
          max_children: number
          max_occupancy: number
          name_ar: string
          name_en: string
          size_sqm: number | null
          sort_order: number
          standard_occupancy: number
          status: Database["public"]["Enums"]["room_status"]
          total_rooms: number
          updated_at: string
        }
        Insert: {
          bed_configuration_ar?: string | null
          bed_configuration_en?: string | null
          code: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          hotel_id: string
          id?: string
          max_adults?: number
          max_children?: number
          max_occupancy: number
          name_ar: string
          name_en: string
          size_sqm?: number | null
          sort_order?: number
          standard_occupancy?: number
          status?: Database["public"]["Enums"]["room_status"]
          total_rooms?: number
          updated_at?: string
        }
        Update: {
          bed_configuration_ar?: string | null
          bed_configuration_en?: string | null
          code?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          hotel_id?: string
          id?: string
          max_adults?: number
          max_children?: number
          max_occupancy?: number
          name_ar?: string
          name_en?: string
          size_sqm?: number | null
          sort_order?: number
          standard_occupancy?: number
          status?: Database["public"]["Enums"]["room_status"]
          total_rooms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_types_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credentials: {
        Row: {
          credential_key: string
          integration_id: string
          updated_at: string
          updated_by: string | null
          vault_secret_id: string
        }
        Insert: {
          credential_key: string
          integration_id: string
          updated_at?: string
          updated_by?: string | null
          vault_secret_id: string
        }
        Update: {
          credential_key?: string
          integration_id?: string
          updated_at?: string
          updated_by?: string | null
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credentials_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "supplier_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_integrations: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          display_name_ar: string
          display_name_en: string
          environment: Database["public"]["Enums"]["supplier_environment"]
          id: string
          is_enabled: boolean
          last_test_message: string | null
          last_test_ok: boolean | null
          last_tested_at: string | null
          priority: number
          provider_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_name_ar: string
          display_name_en: string
          environment?: Database["public"]["Enums"]["supplier_environment"]
          id?: string
          is_enabled?: boolean
          last_test_message?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          priority?: number
          provider_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_name_ar?: string
          display_name_en?: string
          environment?: Database["public"]["Enums"]["supplier_environment"]
          id?: string
          is_enabled?: boolean
          last_test_message?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          priority?: number
          provider_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tax_rates: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name_ar: string
          name_en: string
          percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name_ar: string
          name_en: string
          percent: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name_ar?: string
          name_en?: string
          percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_items: {
        Row: {
          booking_id: string
          city_ar: string | null
          city_en: string | null
          created_at: string
          currency_code: string
          direction: Database["public"]["Enums"]["transfer_direction"]
          flight_number: string | null
          from_name_ar: string
          from_name_en: string
          id: string
          max_passengers: number
          passengers: number
          pickup_notes: string | null
          pickup_time: string | null
          route_code: string
          route_id: string | null
          sell_per_vehicle: number
          sell_total: number
          to_name_ar: string
          to_name_en: string
          transfer_date: string
          vehicle_name_ar: string
          vehicle_name_en: string
          vehicle_type_id: string | null
          vehicles: number
        }
        Insert: {
          booking_id: string
          city_ar?: string | null
          city_en?: string | null
          created_at?: string
          currency_code: string
          direction: Database["public"]["Enums"]["transfer_direction"]
          flight_number?: string | null
          from_name_ar: string
          from_name_en: string
          id?: string
          max_passengers: number
          passengers: number
          pickup_notes?: string | null
          pickup_time?: string | null
          route_code: string
          route_id?: string | null
          sell_per_vehicle: number
          sell_total: number
          to_name_ar: string
          to_name_en: string
          transfer_date: string
          vehicle_name_ar: string
          vehicle_name_en: string
          vehicle_type_id?: string | null
          vehicles?: number
        }
        Update: {
          booking_id?: string
          city_ar?: string | null
          city_en?: string | null
          created_at?: string
          currency_code?: string
          direction?: Database["public"]["Enums"]["transfer_direction"]
          flight_number?: string | null
          from_name_ar?: string
          from_name_en?: string
          id?: string
          max_passengers?: number
          passengers?: number
          pickup_notes?: string | null
          pickup_time?: string | null
          route_code?: string
          route_id?: string | null
          sell_per_vehicle?: number
          sell_total?: number
          to_name_ar?: string
          to_name_en?: string
          transfer_date?: string
          vehicle_name_ar?: string
          vehicle_name_en?: string
          vehicle_type_id?: string | null
          vehicles?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transfer_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_rates: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          is_closed: boolean
          price_per_vehicle: number
          route_id: string
          updated_at: string
          valid_period: unknown
          vehicle_type_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          is_closed?: boolean
          price_per_vehicle: number
          route_id: string
          updated_at?: string
          valid_period: unknown
          vehicle_type_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          is_closed?: boolean
          price_per_vehicle?: number
          route_id?: string
          updated_at?: string
          valid_period?: unknown
          vehicle_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_rates_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transfer_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_rates_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_routes: {
        Row: {
          city_ar: string
          city_en: string
          code: string
          country_code: string
          created_at: string
          direction: Database["public"]["Enums"]["transfer_direction"]
          distance_km: number | null
          duration_minutes: number | null
          from_name_ar: string
          from_name_en: string
          id: string
          is_active: boolean
          to_name_ar: string
          to_name_en: string
          updated_at: string
        }
        Insert: {
          city_ar: string
          city_en: string
          code: string
          country_code: string
          created_at?: string
          direction?: Database["public"]["Enums"]["transfer_direction"]
          distance_km?: number | null
          duration_minutes?: number | null
          from_name_ar: string
          from_name_en: string
          id?: string
          is_active?: boolean
          to_name_ar: string
          to_name_en: string
          updated_at?: string
        }
        Update: {
          city_ar?: string
          city_en?: string
          code?: string
          country_code?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["transfer_direction"]
          distance_km?: number | null
          duration_minutes?: number | null
          from_name_ar?: string
          from_name_en?: string
          id?: string
          is_active?: boolean
          to_name_ar?: string
          to_name_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_types: {
        Row: {
          code: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          image_public_id: string | null
          is_active: boolean
          max_luggage: number
          max_passengers: number
          name_ar: string
          name_en: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_public_id?: string | null
          is_active?: boolean
          max_luggage?: number
          max_passengers: number
          name_ar: string
          name_en: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_public_id?: string | null
          is_active?: boolean
          max_luggage?: number
          max_passengers?: number
          name_ar?: string
          name_en?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      agency_status_counts: {
        Row: {
          count: number | null
          status: Database["public"]["Enums"]["agency_status"] | null
        }
        Relationships: []
      }
      hotel_status_counts: {
        Row: {
          count: number | null
          status: Database["public"]["Enums"]["hotel_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_assignment: {
        Args: {
          p_assignment_id: string
          p_notes?: string
          p_status: Database["public"]["Enums"]["assignment_status"]
        }
        Returns: undefined
      }
      agency_balance: { Args: { p_agency_id: string }; Returns: number }
      agency_outstanding: { Args: { p_agency_id: string }; Returns: number }
      agency_statement: {
        Args: { p_agency_id: string; p_from?: string; p_to?: string }
        Returns: {
          credit: number
          currency_code: string
          debit: number
          description: string
          entry_date: string
          entry_type: string
          reference: string
          running_balance: number
        }[]
      }
      approve_agency: { Args: { p_agency_id: string }; Returns: undefined }
      assert_can_report: { Args: never; Returns: undefined }
      assign_driver: {
        Args: {
          p_driver_id: string
          p_transfer_item_id: string
          p_vehicle_seq: number
        }
        Returns: string
      }
      authenticate_b2b_api_key: {
        Args: { p_key_hash: string }
        Returns: {
          agency_code: string
          agency_id: string
          agency_name: string
          agency_status: string
          allowed_ips: string[]
          key_id: string
          rate_limit: number
        }[]
      }
      authorize: { Args: { p_permission: string }; Returns: boolean }
      booking_driver_contacts: {
        Args: { p_booking_id: string }
        Returns: {
          driver_name: string
          driver_phone: string
          status: Database["public"]["Enums"]["assignment_status"]
          vehicle_seq: number
        }[]
      }
      bootstrap_super_admin: { Args: { p_email: string }; Returns: string }
      can_read_own_agency: { Args: never; Returns: boolean }
      cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      clear_supplier_credential: {
        Args: { p_credential_key: string; p_provider_key: string }
        Returns: undefined
      }
      complete_booking: { Args: { p_booking_id: string }; Returns: undefined }
      confirm_booking: { Args: { p_booking_id: string }; Returns: undefined }
      convert_lead: {
        Args: { p_agency_id: string; p_lead_id: string }
        Returns: undefined
      }
      create_b2b_api_booking: {
        Args: {
          p_adults: number
          p_api_key_id: string
          p_check_in: string
          p_check_out: string
          p_children: number
          p_client_reference?: string
          p_guest_email?: string
          p_guest_name: string
          p_guest_phone?: string
          p_promo_code?: string
          p_rate_plan_id: string
          p_requests?: string
          p_room_type_id: string
          p_rooms: number
        }
        Returns: {
          booking_id: string
          currency_code: string
          reference: string
          status: string
          total_sell: number
        }[]
      }
      create_booking: {
        Args: {
          p_adults: number
          p_check_in: string
          p_check_out: string
          p_children: number
          p_guest_email?: string
          p_guest_name: string
          p_guest_phone?: string
          p_promo_code?: string
          p_quotation_id?: string
          p_rate_plan_id: string
          p_requests?: string
          p_room_type_id: string
          p_rooms: number
        }
        Returns: {
          booking_id: string
          currency_code: string
          reference: string
          total_sell: number
        }[]
      }
      create_hotel_booking_for: {
        Args: {
          p_actor_id: string
          p_adults: number
          p_agency_id: string
          p_api_key_id: string
          p_check_in: string
          p_check_out: string
          p_children: number
          p_client_reference: string
          p_guest_email: string
          p_guest_name: string
          p_guest_phone: string
          p_promo_code: string
          p_quotation_id: string
          p_rate_plan_id: string
          p_requests: string
          p_room_type_id: string
          p_rooms: number
        }
        Returns: {
          booking_id: string
          currency_code: string
          reference: string
          total_sell: number
        }[]
      }
      create_package_booking: {
        Args: {
          p_children?: number
          p_departure_id: string
          p_double?: number
          p_guest_email?: string
          p_guest_name?: string
          p_guest_phone?: string
          p_promo_code?: string
          p_requests?: string
          p_single?: number
          p_triple?: number
        }
        Returns: {
          booking_id: string
          currency_code: string
          reference: string
          total_sell: number
        }[]
      }
      create_transfer_booking: {
        Args: {
          p_date: string
          p_flight_number?: string
          p_guest_email?: string
          p_guest_name: string
          p_guest_phone?: string
          p_passengers: number
          p_pickup_notes?: string
          p_pickup_time?: string
          p_promo_code?: string
          p_route_id: string
          p_vehicle_type_id: string
          p_vehicles: number
        }
        Returns: {
          booking_id: string
          currency_code: string
          reference: string
          total_sell: number
        }[]
      }
      crm_pipeline_summary: {
        Args: never
        Returns: {
          lead_count: number
          stage: Database["public"]["Enums"]["lead_stage"]
        }[]
      }
      current_agency_id: { Args: never; Returns: string }
      current_role_id: { Args: never; Returns: string }
      dispatch_board: {
        Args: { p_date?: string }
        Returns: {
          agency_name: string
          assignment_id: string
          assignment_status: Database["public"]["Enums"]["assignment_status"]
          booking_id: string
          booking_status: Database["public"]["Enums"]["booking_status"]
          city_ar: string
          city_en: string
          direction: Database["public"]["Enums"]["transfer_direction"]
          driver_id: string
          driver_name: string
          driver_phone: string
          flight_number: string
          from_name_ar: string
          from_name_en: string
          job_date: string
          passengers: number
          pickup_time: string
          reference: string
          to_name_ar: string
          to_name_en: string
          transfer_item_id: string
          vehicle_name_ar: string
          vehicle_name_en: string
          vehicle_seq: number
        }[]
      }
      enabled_supplier_keys: { Args: never; Returns: string[] }
      enabled_supplier_keys_for_agency: {
        Args: { p_agency_id?: string }
        Returns: string[]
      }
      evaluate_promo_code: {
        Args: {
          p_agency_id: string
          p_code: string
          p_stay_date?: string
          p_subtotal: number
        }
        Returns: {
          code: string
          discount: number
          promo_id: string
          reason: string
        }[]
      }
      has_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      is_active_user: { Args: never; Returns: boolean }
      is_super_admin: { Args: { p_user_id?: string }; Returns: boolean }
      my_credit_summary: {
        Args: never
        Returns: {
          available: number
          balance: number
          credit_limit: number
          currency_code: string
          outstanding: number
          paid: number
        }[]
      }
      my_driver_jobs: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          assignment_id: string
          booking_status: Database["public"]["Enums"]["booking_status"]
          city_ar: string
          city_en: string
          direction: Database["public"]["Enums"]["transfer_direction"]
          driver_notes: string
          flight_number: string
          from_name_ar: string
          from_name_en: string
          guest_name: string
          guest_phone: string
          job_date: string
          passengers: number
          pickup_notes: string
          pickup_time: string
          reference: string
          status: Database["public"]["Enums"]["assignment_status"]
          to_name_ar: string
          to_name_en: string
          vehicle_name_ar: string
          vehicle_name_en: string
          vehicle_seq: number
          vehicles: number
        }[]
      }
      next_booking_ref: { Args: never; Returns: string }
      next_hotel_code: { Args: never; Returns: string }
      next_quotation_ref: { Args: never; Returns: string }
      offer_net_total: {
        Args: {
          p_adults: number
          p_check_in: string
          p_check_out: string
          p_children: number
          p_rate_plan_id: string
          p_room_type_id: string
          p_rooms?: number
        }
        Returns: number
      }
      package_net_total: {
        Args: {
          p_children?: number
          p_departure_id: string
          p_double?: number
          p_single?: number
          p_triple?: number
        }
        Returns: number
      }
      read_supplier_credential: {
        Args: { p_credential_key: string; p_provider_key: string }
        Returns: string
      }
      receivables_summary: {
        Args: never
        Returns: {
          agency_code: string
          agency_id: string
          agency_name: string
          balance: number
          credit_limit: number
          currency_code: string
          outstanding: number
          paid: number
        }[]
      }
      record_payment: {
        Args: {
          p_agency_id: string
          p_amount: number
          p_currency?: string
          p_external_reference?: string
          p_kind?: Database["public"]["Enums"]["payment_kind"]
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes?: string
          p_paid_on: string
        }
        Returns: {
          payment_id: string
          reference: string
        }[]
      }
      reject_agency: {
        Args: { p_agency_id: string; p_reason: string }
        Returns: undefined
      }
      report_agent_performance: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          agency_code: string
          agency_id: string
          agency_name: string
          balance: number
          bookings_cancelled: number
          bookings_live: number
          bookings_total: number
          cancellation_pct: number
          currency_code: string
          margin: number
          margin_pct: number
          net_total: number
          paid_total: number
          room_nights: number
          sell_total: number
        }[]
      }
      report_bookings: {
        Args: {
          p_agency_id?: string
          p_from?: string
          p_hotel_id?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          agency_code: string
          agency_name: string
          booked_on: string
          check_in: string
          check_out: string
          currency_code: string
          guest_name: string
          hotel_name_ar: string
          hotel_name_en: string
          margin: number
          margin_pct: number
          net_total: number
          nights: number
          reference: string
          room_nights: number
          rooms: number
          sell_total: number
          status: string
        }[]
      }
      report_hotel_performance: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          bookings_live: number
          city_ar: string
          city_en: string
          currency_code: string
          hotel_code: string
          hotel_id: string
          hotel_name_ar: string
          hotel_name_en: string
          margin: number
          margin_pct: number
          net_total: number
          room_nights: number
          sell_total: number
        }[]
      }
      resolve_markup: {
        Args: { p_agency_id: string; p_hotel_id: string }
        Returns: {
          markup_type: Database["public"]["Enums"]["charge_type"]
          markup_value: number
          scope: Database["public"]["Enums"]["markup_scope"]
        }[]
      }
      search_availability: {
        Args: {
          p_adults?: number
          p_check_in: string
          p_check_out: string
          p_children?: number
          p_city?: string
          p_country?: string
          p_query?: string
          p_rooms?: number
        }
        Returns: {
          city_ar: string
          city_en: string
          country_code: string
          cover_url: string
          currency_code: string
          hotel_code: string
          hotel_id: string
          is_refundable: boolean
          max_occupancy: number
          meal_plan_key: string
          name_ar: string
          name_en: string
          nights: number
          plan_name_ar: string
          plan_name_en: string
          property_type: Database["public"]["Enums"]["property_type"]
          rate_plan_id: string
          room_code: string
          room_name_ar: string
          room_name_en: string
          room_type_id: string
          rooms_available: number
          sell_per_night: number
          sell_total: number
          star_rating: number
        }[]
      }
      search_availability_for: {
        Args: {
          p_adults?: number
          p_agency_id: string
          p_check_in: string
          p_check_out: string
          p_children?: number
          p_city?: string
          p_country?: string
          p_query?: string
          p_rooms?: number
        }
        Returns: {
          city_ar: string
          city_en: string
          country_code: string
          cover_url: string
          currency_code: string
          hotel_code: string
          hotel_id: string
          is_refundable: boolean
          max_occupancy: number
          meal_plan_key: string
          name_ar: string
          name_en: string
          nights: number
          plan_name_ar: string
          plan_name_en: string
          property_type: Database["public"]["Enums"]["property_type"]
          rate_plan_id: string
          room_code: string
          room_name_ar: string
          room_name_en: string
          room_type_id: string
          rooms_available: number
          sell_per_night: number
          sell_total: number
          star_rating: number
        }[]
      }
      search_packages: {
        Args: {
          p_city?: string
          p_country?: string
          p_from?: string
          p_query?: string
          p_to?: string
          p_travellers?: number
        }
        Returns: {
          city_ar: string
          city_en: string
          country_code: string
          cover_image: string
          currency_code: string
          departure_date: string
          departure_id: string
          duration_nights: number
          name_ar: string
          name_en: string
          package_code: string
          package_id: string
          return_date: string
          seats_left: number
          sell_child: number
          sell_double: number
          sell_single: number
          sell_triple: number
          summary_ar: string
          summary_en: string
        }[]
      }
      search_transfers: {
        Args: {
          p_city?: string
          p_country?: string
          p_date: string
          p_passengers?: number
          p_query?: string
        }
        Returns: {
          city_ar: string
          city_en: string
          country_code: string
          currency_code: string
          direction: Database["public"]["Enums"]["transfer_direction"]
          duration_minutes: number
          from_name_ar: string
          from_name_en: string
          max_luggage: number
          max_passengers: number
          route_code: string
          route_id: string
          sell_per_vehicle: number
          to_name_ar: string
          to_name_en: string
          vehicle_image: string
          vehicle_name_ar: string
          vehicle_name_en: string
          vehicle_type_id: string
        }[]
      }
      set_agency_status: {
        Args: {
          p_agency_id: string
          p_status: Database["public"]["Enums"]["agency_status"]
        }
        Returns: undefined
      }
      set_agency_supplier_preference: {
        Args: {
          p_agency_id: string
          p_is_enabled: boolean
          p_supplier_key: string
        }
        Returns: undefined
      }
      set_driver_active: {
        Args: { p_active: boolean; p_driver_id: string }
        Returns: undefined
      }
      set_supplier_credential: {
        Args: {
          p_credential_key: string
          p_provider_key: string
          p_value: string
        }
        Returns: undefined
      }
      set_task_status: {
        Args: {
          p_status: Database["public"]["Enums"]["task_status"]
          p_task_id: string
        }
        Returns: undefined
      }
      transfer_net_total: {
        Args: {
          p_date: string
          p_route_id: string
          p_vehicle_type_id: string
          p_vehicles?: number
        }
        Returns: number
      }
      unassign_driver: { Args: { p_assignment_id: string }; Returns: undefined }
      write_audit: {
        Args: {
          p_action: string
          p_changes?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      activity_kind: "call" | "email" | "meeting" | "whatsapp" | "note"
      agency_status: "pending" | "active" | "suspended" | "rejected"
      assignment_status:
        | "assigned"
        | "en_route"
        | "arrived"
        | "picked_up"
        | "completed"
        | "no_show"
        | "cancelled"
      booking_status: "pending" | "confirmed" | "cancelled" | "completed"
      charge_type: "percentage" | "fixed" | "nights"
      hotel_status: "draft" | "active" | "inactive"
      lead_source:
        | "referral"
        | "website"
        | "exhibition"
        | "cold_call"
        | "social"
        | "existing_client"
        | "other"
      lead_stage:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "won"
        | "lost"
      markup_scope: "global" | "agency" | "hotel" | "agency_hotel"
      offer_type: "early_bird" | "long_stay" | "free_nights" | "discount"
      package_occupancy: "single" | "double" | "triple" | "child"
      package_status: "draft" | "active" | "archived"
      payment_kind: "receipt" | "refund"
      payment_method: "bank_transfer" | "cheque" | "cash" | "adjustment"
      product_type: "hotel" | "transfer" | "package"
      property_type:
        | "hotel"
        | "resort"
        | "apartment"
        | "villa"
        | "guesthouse"
        | "hostel"
        | "boutique"
      quotation_status: "draft" | "sent" | "accepted" | "expired"
      rate_plan_status: "draft" | "active" | "inactive"
      role_scope: "admin" | "agent" | "driver"
      room_status: "active" | "inactive"
      supplier_environment: "sandbox" | "production"
      task_status: "open" | "done" | "cancelled"
      transfer_direction: "arrival" | "departure" | "point_to_point"
      user_status: "pending" | "active" | "suspended" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_kind: ["call", "email", "meeting", "whatsapp", "note"],
      agency_status: ["pending", "active", "suspended", "rejected"],
      assignment_status: [
        "assigned",
        "en_route",
        "arrived",
        "picked_up",
        "completed",
        "no_show",
        "cancelled",
      ],
      booking_status: ["pending", "confirmed", "cancelled", "completed"],
      charge_type: ["percentage", "fixed", "nights"],
      hotel_status: ["draft", "active", "inactive"],
      lead_source: [
        "referral",
        "website",
        "exhibition",
        "cold_call",
        "social",
        "existing_client",
        "other",
      ],
      lead_stage: ["new", "contacted", "qualified", "proposal", "won", "lost"],
      markup_scope: ["global", "agency", "hotel", "agency_hotel"],
      offer_type: ["early_bird", "long_stay", "free_nights", "discount"],
      package_occupancy: ["single", "double", "triple", "child"],
      package_status: ["draft", "active", "archived"],
      payment_kind: ["receipt", "refund"],
      payment_method: ["bank_transfer", "cheque", "cash", "adjustment"],
      product_type: ["hotel", "transfer", "package"],
      property_type: [
        "hotel",
        "resort",
        "apartment",
        "villa",
        "guesthouse",
        "hostel",
        "boutique",
      ],
      quotation_status: ["draft", "sent", "accepted", "expired"],
      rate_plan_status: ["draft", "active", "inactive"],
      role_scope: ["admin", "agent", "driver"],
      room_status: ["active", "inactive"],
      supplier_environment: ["sandbox", "production"],
      task_status: ["open", "done", "cancelled"],
      transfer_direction: ["arrival", "departure", "point_to_point"],
      user_status: ["pending", "active", "suspended", "rejected"],
    },
  },
} as const
