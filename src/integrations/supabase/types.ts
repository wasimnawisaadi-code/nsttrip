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
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          hours_worked: number | null
          id: string
          login_lat: number | null
          login_lng: number | null
          login_location_status: string | null
          login_time: string | null
          logout_lat: number | null
          logout_lng: number | null
          logout_time: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          work_summary: string | null
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          login_lat?: number | null
          login_lng?: number | null
          login_location_status?: string | null
          login_time?: string | null
          logout_lat?: number | null
          logout_lng?: number | null
          logout_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          work_summary?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          login_lat?: number | null
          login_lng?: number | null
          login_location_status?: string | null
          login_time?: string | null
          logout_lat?: number | null
          logout_lng?: number | null
          logout_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"] | null
          work_summary?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          id: string
          target_id: string | null
          target_type: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_type: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_type?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      chat_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          members: string[] | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          members?: string[] | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          members?: string[] | null
          name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachment_duration: number | null
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          created_at: string
          group_id: string | null
          id: string
          is_read: boolean | null
          message_type: Database["public"]["Enums"]["chat_type"]
          recipient_id: string | null
          sender_id: string
          sender_name: string
          sender_photo: string | null
          text: string | null
        }
        Insert: {
          attachment_duration?: number | null
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: Database["public"]["Enums"]["chat_type"]
          recipient_id?: string | null
          sender_id: string
          sender_name: string
          sender_photo?: string | null
          text?: string | null
        }
        Update: {
          attachment_duration?: number | null
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message_type?: Database["public"]["Enums"]["chat_type"]
          recipient_id?: string | null
          sender_id?: string
          sender_name?: string
          sender_photo?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      client_services: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          display_id: string
          documents: Json | null
          family_members: Json | null
          id: string
          request_month: string | null
          service: string
          service_details: Json | null
          service_subcategory: string | null
          status: Database["public"]["Enums"]["client_status"] | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          display_id: string
          documents?: Json | null
          family_members?: Json | null
          id?: string
          request_month?: string | null
          service: string
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          display_id?: string
          documents?: Json | null
          family_members?: Json | null
          id?: string
          request_month?: string | null
          service?: string
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "client_services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          assigned_to: string | null
          client_type: string | null
          company_name: string | null
          company_number: string | null
          created_at: string
          created_by: string
          display_id: string
          documents: Json | null
          email: string | null
          family_members: Json | null
          id: string
          important_dates: Json | null
          lead_source: string | null
          mobile: string
          name: string
          nationality: string | null
          notes: string | null
          passport_no: string | null
          payment_type: string | null
          profit: number | null
          revenue: number | null
          service: string | null
          service_details: Json | null
          service_subcategory: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_type?: string | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          created_by: string
          display_id: string
          documents?: Json | null
          email?: string | null
          family_members?: Json | null
          id?: string
          important_dates?: Json | null
          lead_source?: string | null
          mobile: string
          name: string
          nationality?: string | null
          notes?: string | null
          passport_no?: string | null
          payment_type?: string | null
          profit?: number | null
          revenue?: number | null
          service?: string | null
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_type?: string | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          created_by?: string
          display_id?: string
          documents?: Json | null
          email?: string | null
          family_members?: Json | null
          id?: string
          important_dates?: Json | null
          lead_source?: string | null
          mobile?: string
          name?: string
          nationality?: string | null
          notes?: string | null
          passport_no?: string | null
          payment_type?: string | null
          profit?: number | null
          revenue?: number | null
          service?: string | null
          service_details?: Json | null
          service_subcategory?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          updated_at?: string
        }
        Relationships: []
      }
      date_reminder_prefs: {
        Row: {
          client_id: string
          date_label: string
          id: string
          last_reminder_sent_at: string | null
          silenced: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          date_label: string
          id?: string
          last_reminder_sent_at?: string | null
          silenced?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          date_label?: string
          id?: string
          last_reminder_sent_at?: string | null
          silenced?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "date_reminder_prefs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      dsr_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          employee_id: string
          id: string
          template_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          employee_id: string
          id?: string
          template_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          employee_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsr_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dsr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dsr_entries: {
        Row: {
          cost_amount: number | null
          created_at: string
          data: Json
          display_id: string
          employee_id: string
          employee_name: string | null
          entry_date: string
          id: string
          profit_amount: number | null
          sale_amount: number | null
          source: string
          template_id: string
          template_key: string
          updated_at: string
        }
        Insert: {
          cost_amount?: number | null
          created_at?: string
          data?: Json
          display_id: string
          employee_id: string
          employee_name?: string | null
          entry_date?: string
          id?: string
          profit_amount?: number | null
          sale_amount?: number | null
          source?: string
          template_id: string
          template_key: string
          updated_at?: string
        }
        Update: {
          cost_amount?: number | null
          created_at?: string
          data?: Json
          display_id?: string
          employee_id?: string
          employee_name?: string | null
          entry_date?: string
          id?: string
          profit_amount?: number | null
          sale_amount?: number | null
          source?: string
          template_id?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsr_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dsr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dsr_templates: {
        Row: {
          columns: Json
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          template_key: string
          updated_at: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          template_key: string
          updated_at?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      geofence_zones: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          radius: number
          updated_at: string
          zone_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          radius?: number
          updated_at?: string
          zone_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          radius?: number
          updated_at?: string
          zone_type?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          achieved: number | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_id: string
          end_date: string | null
          goal_tasks: Json | null
          id: string
          service: string
          start_date: string | null
          target: number | null
          title: string | null
          year_month: string
        }
        Insert: {
          achieved?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_id: string
          end_date?: string | null
          goal_tasks?: Json | null
          id?: string
          service: string
          start_date?: string | null
          target?: number | null
          title?: string | null
          year_month: string
        }
        Update: {
          achieved?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_id?: string
          end_date?: string | null
          goal_tasks?: Json | null
          id?: string
          service?: string
          start_date?: string | null
          target?: number | null
          title?: string | null
          year_month?: string
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "social_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number | null
          display_id: string
          document: Json | null
          employee_id: string
          employee_name: string
          end_date: string
          id: string
          leave_type: string | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"] | null
        }
        Insert: {
          created_at?: string
          days?: number | null
          display_id: string
          document?: Json | null
          employee_id: string
          employee_name: string
          end_date: string
          id?: string
          leave_type?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"] | null
        }
        Update: {
          created_at?: string
          days?: number | null
          display_id?: string
          document?: Json | null
          employee_id?: string
          employee_name?: string
          end_date?: string
          id?: string
          leave_type?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"] | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll: {
        Row: {
          absence_deduction: number | null
          absent_days: number | null
          allowances: number | null
          base_salary: number | null
          bonus: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          display_id: string
          employee_id: string
          final_salary: number | null
          id: string
          late_days: number | null
          late_deduction: number | null
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          overtime: number | null
          paid_leave_days: number | null
          present_days: number | null
          sick_deduction: number | null
          sick_leave: number | null
          status: Database["public"]["Enums"]["payroll_status"] | null
          total_deductions: number | null
          total_hours: number | null
          unpaid_deduction: number | null
          unpaid_leave: number | null
          year_month: string
        }
        Insert: {
          absence_deduction?: number | null
          absent_days?: number | null
          allowances?: number | null
          base_salary?: number | null
          bonus?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_id: string
          employee_id: string
          final_salary?: number | null
          id?: string
          late_days?: number | null
          late_deduction?: number | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          overtime?: number | null
          paid_leave_days?: number | null
          present_days?: number | null
          sick_deduction?: number | null
          sick_leave?: number | null
          status?: Database["public"]["Enums"]["payroll_status"] | null
          total_deductions?: number | null
          total_hours?: number | null
          unpaid_deduction?: number | null
          unpaid_leave?: number | null
          year_month: string
        }
        Update: {
          absence_deduction?: number | null
          absent_days?: number | null
          allowances?: number | null
          base_salary?: number | null
          bonus?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_id?: string
          employee_id?: string
          final_salary?: number | null
          id?: string
          late_days?: number | null
          late_deduction?: number | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          overtime?: number | null
          paid_leave_days?: number | null
          present_days?: number | null
          sick_deduction?: number | null
          sick_leave?: number | null
          status?: Database["public"]["Enums"]["payroll_status"] | null
          total_deductions?: number | null
          total_hours?: number | null
          unpaid_deduction?: number | null
          unpaid_leave?: number | null
          year_month?: string
        }
        Relationships: []
      }
      payroll_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          entry_type: string
          id: string
          payroll_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          entry_type: string
          id?: string
          payroll_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          entry_type?: string
          id?: string
          payroll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allowed_ips: string[] | null
          assigned_zone_id: string | null
          base_salary: number | null
          created_at: string
          email: string
          emirates_id: string | null
          id: string
          leave_balance: number | null
          mobile: string | null
          name: string
          passport_no: string | null
          photo_url: string | null
          profile_type:
            | Database["public"]["Enums"]["employee_profile_type"]
            | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_ips?: string[] | null
          assigned_zone_id?: string | null
          base_salary?: number | null
          created_at?: string
          email: string
          emirates_id?: string | null
          id?: string
          leave_balance?: number | null
          mobile?: string | null
          name: string
          passport_no?: string | null
          photo_url?: string | null
          profile_type?:
            | Database["public"]["Enums"]["employee_profile_type"]
            | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_ips?: string[] | null
          assigned_zone_id?: string | null
          base_salary?: number | null
          created_at?: string
          email?: string
          emirates_id?: string | null
          id?: string
          leave_balance?: number | null
          mobile?: string | null
          name?: string
          passport_no?: string | null
          photo_url?: string | null
          profile_type?:
            | Database["public"]["Enums"]["employee_profile_type"]
            | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_assigned_zone_id_fkey"
            columns: ["assigned_zone_id"]
            isOneToOne: false
            referencedRelation: "geofence_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          client_id: string | null
          client_name: string | null
          display_id: string
          emailed_at: string | null
          generated_at: string
          generated_by: string | null
          id: string
          line_items: Json | null
          payable_amount: number | null
          profit: number | null
          quoted_price: number | null
          service: string | null
          status: string | null
          valid_until: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          display_id: string
          emailed_at?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_items?: Json | null
          payable_amount?: number | null
          profit?: number | null
          quoted_price?: number | null
          service?: string | null
          status?: string | null
          valid_until?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          display_id?: string
          emailed_at?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_items?: Json | null
          payable_amount?: number | null
          profit?: number | null
          quoted_price?: number | null
          service?: string | null
          status?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_leads: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          client_need: string | null
          converted_at: string | null
          created_at: string
          display_id: string
          first_name: string | null
          follow_up_date: string | null
          full_name: string | null
          gender: string | null
          id: string
          language: string | null
          last_interaction: string | null
          last_name: string | null
          last_seen: string | null
          messaging_window: string | null
          notes: string | null
          opted_in: boolean | null
          page_id: string | null
          phone: string | null
          proof_url: string | null
          raw: Json | null
          source: string
          status: string
          subscribed: boolean | null
          timezone: string | null
          unique_key: string
          updated_at: string
          username: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          client_need?: string | null
          converted_at?: string | null
          created_at?: string
          display_id: string
          first_name?: string | null
          follow_up_date?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          language?: string | null
          last_interaction?: string | null
          last_name?: string | null
          last_seen?: string | null
          messaging_window?: string | null
          notes?: string | null
          opted_in?: boolean | null
          page_id?: string | null
          phone?: string | null
          proof_url?: string | null
          raw?: Json | null
          source: string
          status?: string
          subscribed?: boolean | null
          timezone?: string | null
          unique_key: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          client_need?: string | null
          converted_at?: string | null
          created_at?: string
          display_id?: string
          first_name?: string | null
          follow_up_date?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          language?: string | null
          last_interaction?: string | null
          last_name?: string | null
          last_seen?: string | null
          messaging_window?: string | null
          notes?: string | null
          opted_in?: boolean | null
          page_id?: string | null
          phone?: string | null
          proof_url?: string | null
          raw?: Json | null
          source?: string
          status?: string
          subscribed?: boolean | null
          timezone?: string | null
          unique_key?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          client_id: string | null
          client_name: string | null
          completed_date: string | null
          created_at: string
          created_by: string
          display_id: string
          due_date: string | null
          id: string
          notes: string | null
          profit: number | null
          service: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          client_id?: string | null
          client_name?: string | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          display_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          profit?: number | null
          service?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          client_id?: string | null
          client_name?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          display_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          profit?: number | null
          service?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_display_id: { Args: { prefix: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "employee" | "superadmin"
      attendance_status: "Present" | "Late" | "Absent"
      chat_type: "group" | "direct"
      client_status: "New" | "Processing" | "Success" | "Failed"
      employee_profile_type: "office" | "sales"
      leave_status: "Pending" | "Approved" | "Rejected"
      payroll_status: "Draft" | "Confirmed"
      task_status: "New" | "Processing" | "Completed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "employee", "superadmin"],
      attendance_status: ["Present", "Late", "Absent"],
      chat_type: ["group", "direct"],
      client_status: ["New", "Processing", "Success", "Failed"],
      employee_profile_type: ["office", "sales"],
      leave_status: ["Pending", "Approved", "Rejected"],
      payroll_status: ["Draft", "Confirmed"],
      task_status: ["New", "Processing", "Completed"],
    },
  },
} as const
