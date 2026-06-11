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
      ai_chat_history: {
        Row: {
          content: string
          created_at: string | null
          id: string
          module_context: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          module_context?: string | null
          role: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          module_context?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      apify_actors: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          input_template: Json | null
          is_default: boolean
          kind: string
          label: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          input_template?: Json | null
          is_default?: boolean
          kind: string
          label: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          input_template?: Json | null
          is_default?: boolean
          kind?: string
          label?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          avatar_url: string | null
          brand_name: string | null
          colors: Json
          created_at: string
          extracted_at: string | null
          fonts: Json
          footer_text: string | null
          id: string
          logo_dark_url: string | null
          logo_light_url: string | null
          tone: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          brand_name?: string | null
          colors?: Json
          created_at?: string
          extracted_at?: string | null
          fonts?: Json
          footer_text?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          brand_name?: string | null
          colors?: Json
          created_at?: string
          extracted_at?: string | null
          fonts?: Json
          footer_text?: string | null
          id?: string
          logo_dark_url?: string | null
          logo_light_url?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          color: string | null
          completed: boolean | null
          created_at: string | null
          description: string | null
          end_date: string | null
          event_date: string
          event_time: string | null
          event_type: string | null
          id: string
          is_all_day: boolean | null
          is_recurring: boolean | null
          linked_id: string | null
          linked_module: string | null
          recurring_pattern: string | null
          reminder_minutes: number | null
          title: string
          user_id: string
        }
        Insert: {
          color?: string | null
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_date: string
          event_time?: string | null
          event_type?: string | null
          id?: string
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          linked_id?: string | null
          linked_module?: string | null
          recurring_pattern?: string | null
          reminder_minutes?: number | null
          title: string
          user_id: string
        }
        Update: {
          color?: string | null
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_date?: string
          event_time?: string | null
          event_type?: string | null
          id?: string
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          linked_id?: string | null
          linked_module?: string | null
          recurring_pattern?: string | null
          reminder_minutes?: number | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      canva_oauth_tokens: {
        Row: {
          access_token_ciphertext: string | null
          access_token_iv: string | null
          created_at: string
          expires_at: string | null
          id: string
          refresh_lock_owner: string | null
          refresh_lock_until: string | null
          refresh_token_ciphertext: string
          refresh_token_iv: string
          refreshed_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          access_token_iv?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_lock_owner?: string | null
          refresh_lock_until?: string | null
          refresh_token_ciphertext: string
          refresh_token_iv: string
          refreshed_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string | null
          access_token_iv?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          refresh_lock_owner?: string | null
          refresh_lock_until?: string | null
          refresh_token_ciphertext?: string
          refresh_token_iv?: string
          refreshed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      carousels: {
        Row: {
          canva_design_id: string | null
          canva_edit_url: string | null
          canva_view_url: string | null
          copy: Json | null
          created_at: string
          error_message: string | null
          id: string
          image_url: string | null
          posts: Json
          status: string
          user_id: string
        }
        Insert: {
          canva_design_id?: string | null
          canva_edit_url?: string | null
          canva_view_url?: string | null
          copy?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          posts: Json
          status?: string
          user_id: string
        }
        Update: {
          canva_design_id?: string | null
          canva_edit_url?: string | null
          canva_view_url?: string | null
          copy?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          posts?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      content_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_system: boolean | null
          name: string
          position: number | null
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          position?: number | null
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          position?: number | null
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_chat_messages: {
        Row: {
          action_kind: string | null
          content: string
          created_at: string
          id: string
          payload: Json | null
          role: string
          user_id: string
        }
        Insert: {
          action_kind?: string | null
          content: string
          created_at?: string
          id?: string
          payload?: Json | null
          role: string
          user_id: string
        }
        Update: {
          action_kind?: string | null
          content?: string
          created_at?: string
          id?: string
          payload?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          category_id: string | null
          category_name: string | null
          course_description: string | null
          course_name: string | null
          created_at: string
          creator: string | null
          duration: string | null
          id: string
          item_type: string
          key_topics: string | null
          lesson_number: number | null
          level: string | null
          notes: string | null
          origin: string
          position: number | null
          published_label: string | null
          raw_payload: Json | null
          source_url: string | null
          status: string
          target_platforms: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          category_name?: string | null
          course_description?: string | null
          course_name?: string | null
          created_at?: string
          creator?: string | null
          duration?: string | null
          id?: string
          item_type?: string
          key_topics?: string | null
          lesson_number?: number | null
          level?: string | null
          notes?: string | null
          origin?: string
          position?: number | null
          published_label?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          status?: string
          target_platforms?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          category_name?: string | null
          course_description?: string | null
          course_name?: string | null
          created_at?: string
          creator?: string | null
          duration?: string | null
          id?: string
          item_type?: string
          key_topics?: string | null
          lesson_number?: number | null
          level?: string | null
          notes?: string | null
          origin?: string
          position?: number | null
          published_label?: string | null
          raw_payload?: Json | null
          source_url?: string | null
          status?: string
          target_platforms?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      design_assets: {
        Row: {
          created_at: string
          height: number | null
          id: string
          is_profile: boolean
          kind: string
          mime: string | null
          name: string | null
          parent_asset_id: string | null
          prompt: string | null
          public_url: string
          storage_path: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          is_profile?: boolean
          kind: string
          mime?: string | null
          name?: string | null
          parent_asset_id?: string | null
          prompt?: string | null
          public_url: string
          storage_path: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          is_profile?: boolean
          kind?: string
          mime?: string | null
          name?: string | null
          parent_asset_id?: string | null
          prompt?: string | null
          public_url?: string
          storage_path?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "design_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "design_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      design_templates: {
        Row: {
          category: string | null
          created_at: string
          height: number
          id: string
          is_public: boolean
          platform: string
          slides: Json
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          width: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          height?: number
          id?: string
          is_public?: boolean
          platform?: string
          slides?: Json
          thumbnail_url?: string | null
          title?: string
          type: string
          updated_at?: string
          user_id: string
          width?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          height?: number
          id?: string
          is_public?: boolean
          platform?: string
          slides?: Json
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          width?: number
        }
        Relationships: []
      }
      designs: {
        Row: {
          created_at: string
          height: number
          id: string
          kind: string
          planner_entry_id: string | null
          platform: string
          slides: Json
          template_data: Json | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          width: number
        }
        Insert: {
          created_at?: string
          height?: number
          id?: string
          kind?: string
          planner_entry_id?: string | null
          platform?: string
          slides?: Json
          template_data?: Json | null
          thumbnail_url?: string | null
          title?: string
          type: string
          updated_at?: string
          user_id: string
          width?: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          kind?: string
          planner_entry_id?: string | null
          platform?: string
          slides?: Json
          template_data?: Json | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          width?: number
        }
        Relationships: []
      }
      invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          status?: string
        }
        Relationships: []
      }
      kanban_columns: {
        Row: {
          col_order: number | null
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          status_mapping: string | null
          title: string
          user_id: string
          wip_limit: number | null
        }
        Insert: {
          col_order?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          status_mapping?: string | null
          title: string
          user_id: string
          wip_limit?: number | null
        }
        Update: {
          col_order?: number | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          status_mapping?: string | null
          title?: string
          user_id?: string
          wip_limit?: number | null
        }
        Relationships: []
      }
      linkedin_ai_reviews: {
        Row: {
          applied: Json
          design_id: string
          id: string
          review: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          applied?: Json
          design_id: string
          id?: string
          review?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          applied?: Json
          design_id?: string
          id?: string
          review?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      linkedin_design_memory: {
        Row: {
          active: boolean
          created_at: string
          id: string
          rule: string
          source: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          rule: string
          source?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          rule?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      linkedin_engagement_comments: {
        Row: {
          created_at: string
          draft_text: string | null
          id: string
          liked: boolean
          post_id: string
          posted_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_text?: string | null
          id?: string
          liked?: boolean
          post_id: string
          posted_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_text?: string | null
          id?: string
          liked?: boolean
          post_id?: string
          posted_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_engagement_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_post_states: {
        Row: {
          created_at: string
          edited_body: string | null
          notes: string | null
          post_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          edited_body?: string | null
          notes?: string | null
          post_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          edited_body?: string | null
          notes?: string | null
          post_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      linkedin_profile_audits: {
        Row: {
          created_at: string
          diff: Json | null
          id: string
          overall_score: number | null
          profile_url: string | null
          report: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          diff?: Json | null
          id?: string
          overall_score?: number | null
          profile_url?: string | null
          report: Json
          user_id: string
        }
        Update: {
          created_at?: string
          diff?: Json | null
          id?: string
          overall_score?: number | null
          profile_url?: string | null
          report?: Json
          user_id?: string
        }
        Relationships: []
      }
      linkedin_writing_memory: {
        Row: {
          active: boolean
          created_at: string
          id: string
          reason: string | null
          rule: string
          source: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          reason?: string | null
          rule: string
          source?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          reason?: string | null
          rule?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          expires_at: string
          provider: string
          redirect_to: string | null
          redirect_uri: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          provider: string
          redirect_to?: string | null
          redirect_uri?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          provider?: string
          redirect_to?: string | null
          redirect_uri?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          date_of_birth: string | null
          full_name: string | null
          id: string
          name: string | null
          onboarded: boolean
          preferred_language: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          name?: string | null
          onboarded?: boolean
          preferred_language?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          name?: string | null
          onboarded?: boolean
          preferred_language?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      project_areas: {
        Row: {
          color: string
          created_at: string
          id: string
          key: string
          label: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          key: string
          label: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          area: string
          brainstorm_notes: string | null
          color: string | null
          completed_at: string | null
          created_at: string | null
          due_date: string | null
          health_module_link: string | null
          horizon: string
          icon: string | null
          id: string
          is_stuck: boolean | null
          milestones: Json | null
          next_action_id: string | null
          notes: Json | null
          outcome_statement: string | null
          purpose: string | null
          start_date: string | null
          status: string
          success_criteria: string[] | null
          tags: string[] | null
          task_ids: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          area?: string
          brainstorm_notes?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          health_module_link?: string | null
          horizon?: string
          icon?: string | null
          id?: string
          is_stuck?: boolean | null
          milestones?: Json | null
          next_action_id?: string | null
          notes?: Json | null
          outcome_statement?: string | null
          purpose?: string | null
          start_date?: string | null
          status?: string
          success_criteria?: string[] | null
          tags?: string[] | null
          task_ids?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          area?: string
          brainstorm_notes?: string | null
          color?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          health_module_link?: string | null
          horizon?: string
          icon?: string | null
          id?: string
          is_stuck?: boolean | null
          milestones?: Json | null
          next_action_id?: string | null
          notes?: Json | null
          outcome_statement?: string | null
          purpose?: string | null
          start_date?: string | null
          status?: string
          success_criteria?: string[] | null
          tags?: string[] | null
          task_ids?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_apify_accounts: {
        Row: {
          active: boolean
          actor_id: string | null
          actor_input_defaults: Json
          api_token: string
          apify_checked_at: string | null
          apify_cycle_end: string | null
          apify_limit_usd: number | null
          apify_usage_usd: number | null
          cost_per_10_posts_usd: number
          created_at: string
          id: string
          label: string
          last_test_at: string | null
          last_test_status: string | null
          last_used_at: string | null
          monthly_budget_usd: number
          period_start: string
          posts_used_this_period: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          actor_id?: string | null
          actor_input_defaults?: Json
          api_token: string
          apify_checked_at?: string | null
          apify_cycle_end?: string | null
          apify_limit_usd?: number | null
          apify_usage_usd?: number | null
          cost_per_10_posts_usd?: number
          created_at?: string
          id?: string
          label: string
          last_test_at?: string | null
          last_test_status?: string | null
          last_used_at?: string | null
          monthly_budget_usd?: number
          period_start?: string
          posts_used_this_period?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          actor_id?: string | null
          actor_input_defaults?: Json
          api_token?: string
          apify_checked_at?: string | null
          apify_cycle_end?: string | null
          apify_limit_usd?: number | null
          apify_usage_usd?: number | null
          cost_per_10_posts_usd?: number
          created_at?: string
          id?: string
          label?: string
          last_test_at?: string | null
          last_test_status?: string | null
          last_used_at?: string | null
          monthly_budget_usd?: number
          period_start?: string
          posts_used_this_period?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_articles: {
        Row: {
          article_url: string
          author: string | null
          feed_id: string | null
          fetched_at: string
          id: string
          published_at: string | null
          raw_payload: Json | null
          snippet: string | null
          source_label: string | null
          title: string
          user_id: string
        }
        Insert: {
          article_url: string
          author?: string | null
          feed_id?: string | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          raw_payload?: Json | null
          snippet?: string | null
          source_label?: string | null
          title: string
          user_id: string
        }
        Update: {
          article_url?: string
          author?: string | null
          feed_id?: string | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          raw_payload?: Json | null
          snippet?: string | null
          source_label?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_articles_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "social_rss_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      social_content_plan: {
        Row: {
          body: string | null
          canva_design_id: string | null
          canva_design_url: string | null
          created_at: string
          document_filename: string | null
          document_url: string | null
          figma_brief: string | null
          format: string | null
          framework: string | null
          hook: string
          id: string
          image_status: string | null
          image_url: string | null
          notes: string | null
          pillar: string | null
          platforms: string[]
          position: number | null
          posted_at: string | null
          scheduled_at: string | null
          scheduled_date: string | null
          scheduled_day: string | null
          scheduled_time: string | null
          source_article_id: string | null
          source_content_item_id: string | null
          source_hotnews_id: string | null
          source_kind: string | null
          source_post_id: string | null
          source_topic_id: string | null
          status: string
          updated_at: string
          user_id: string
          webhook_error: string | null
          webhook_response: Json | null
          webhook_sent_at: string | null
          webhook_status: string | null
          week_number: number | null
        }
        Insert: {
          body?: string | null
          canva_design_id?: string | null
          canva_design_url?: string | null
          created_at?: string
          document_filename?: string | null
          document_url?: string | null
          figma_brief?: string | null
          format?: string | null
          framework?: string | null
          hook: string
          id?: string
          image_status?: string | null
          image_url?: string | null
          notes?: string | null
          pillar?: string | null
          platforms?: string[]
          position?: number | null
          posted_at?: string | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          scheduled_day?: string | null
          scheduled_time?: string | null
          source_article_id?: string | null
          source_content_item_id?: string | null
          source_hotnews_id?: string | null
          source_kind?: string | null
          source_post_id?: string | null
          source_topic_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          webhook_error?: string | null
          webhook_response?: Json | null
          webhook_sent_at?: string | null
          webhook_status?: string | null
          week_number?: number | null
        }
        Update: {
          body?: string | null
          canva_design_id?: string | null
          canva_design_url?: string | null
          created_at?: string
          document_filename?: string | null
          document_url?: string | null
          figma_brief?: string | null
          format?: string | null
          framework?: string | null
          hook?: string
          id?: string
          image_status?: string | null
          image_url?: string | null
          notes?: string | null
          pillar?: string | null
          platforms?: string[]
          position?: number | null
          posted_at?: string | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          scheduled_day?: string | null
          scheduled_time?: string | null
          source_article_id?: string | null
          source_content_item_id?: string | null
          source_hotnews_id?: string | null
          source_kind?: string | null
          source_post_id?: string | null
          source_topic_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          webhook_error?: string | null
          webhook_response?: Json | null
          webhook_sent_at?: string | null
          webhook_status?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_content_plan_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_content_plan_source_topic_id_fkey"
            columns: ["source_topic_id"]
            isOneToOne: false
            referencedRelation: "social_hot_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      social_generated_drafts: {
        Row: {
          body: string
          created_at: string
          framework: string
          id: string
          plan_id: string | null
          promoted: boolean | null
          rating: number | null
          source_post_id: string | null
          source_topic_id: string | null
          user_id: string
          word_count: number | null
        }
        Insert: {
          body: string
          created_at?: string
          framework: string
          id?: string
          plan_id?: string | null
          promoted?: boolean | null
          rating?: number | null
          source_post_id?: string | null
          source_topic_id?: string | null
          user_id: string
          word_count?: number | null
        }
        Update: {
          body?: string
          created_at?: string
          framework?: string
          id?: string
          plan_id?: string | null
          promoted?: boolean | null
          rating?: number | null
          source_post_id?: string | null
          source_topic_id?: string | null
          user_id?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_generated_drafts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "social_content_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_generated_drafts_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_generated_drafts_source_topic_id_fkey"
            columns: ["source_topic_id"]
            isOneToOne: false
            referencedRelation: "social_hot_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      social_hot_news: {
        Row: {
          article_count: number | null
          description: string | null
          generated_at: string
          id: string
          related_article_ids: string[] | null
          score: number | null
          timeframe: string | null
          title: string
          user_id: string
        }
        Insert: {
          article_count?: number | null
          description?: string | null
          generated_at?: string
          id?: string
          related_article_ids?: string[] | null
          score?: number | null
          timeframe?: string | null
          title: string
          user_id: string
        }
        Update: {
          article_count?: number | null
          description?: string | null
          generated_at?: string
          id?: string
          related_article_ids?: string[] | null
          score?: number | null
          timeframe?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      social_hot_topics: {
        Row: {
          description: string | null
          generated_at: string
          id: string
          post_count: number | null
          profile_count: number | null
          related_post_ids: string[] | null
          score: number | null
          timeframe: string | null
          title: string
          user_id: string
        }
        Insert: {
          description?: string | null
          generated_at?: string
          id?: string
          post_count?: number | null
          profile_count?: number | null
          related_post_ids?: string[] | null
          score?: number | null
          timeframe?: string | null
          title: string
          user_id: string
        }
        Update: {
          description?: string | null
          generated_at?: string
          id?: string
          post_count?: number | null
          profile_count?: number | null
          related_post_ids?: string[] | null
          score?: number | null
          timeframe?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      social_oauth_connections: {
        Row: {
          access_token: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          expires_at: string | null
          provider: string
          provider_user_id: string
          raw_profile: Json | null
          refresh_token: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          expires_at?: string | null
          provider: string
          provider_user_id: string
          raw_profile?: Json | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          expires_at?: string | null
          provider?: string
          provider_user_id?: string
          raw_profile?: Json | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          apify_account_id: string | null
          author: string | null
          comments: number | null
          company: string | null
          external_id: string | null
          id: string
          ignored_at: string | null
          ignored_reason: string | null
          likes: number | null
          post_text: string | null
          post_type: string | null
          post_url: string | null
          posted_at: string | null
          profile_id: string | null
          raw_payload: Json | null
          relevance_computed_at: string | null
          relevance_fields: Json | null
          relevance_reasoning: string | null
          relevance_score: number | null
          scraped_at: string
          shares: number | null
          user_id: string
          views: number | null
        }
        Insert: {
          apify_account_id?: string | null
          author?: string | null
          comments?: number | null
          company?: string | null
          external_id?: string | null
          id?: string
          ignored_at?: string | null
          ignored_reason?: string | null
          likes?: number | null
          post_text?: string | null
          post_type?: string | null
          post_url?: string | null
          posted_at?: string | null
          profile_id?: string | null
          raw_payload?: Json | null
          relevance_computed_at?: string | null
          relevance_fields?: Json | null
          relevance_reasoning?: string | null
          relevance_score?: number | null
          scraped_at?: string
          shares?: number | null
          user_id: string
          views?: number | null
        }
        Update: {
          apify_account_id?: string | null
          author?: string | null
          comments?: number | null
          company?: string | null
          external_id?: string | null
          id?: string
          ignored_at?: string | null
          ignored_reason?: string | null
          likes?: number | null
          post_text?: string | null
          post_type?: string | null
          post_url?: string | null
          posted_at?: string | null
          profile_id?: string | null
          raw_payload?: Json | null
          relevance_computed_at?: string | null
          relevance_fields?: Json | null
          relevance_reasoning?: string | null
          relevance_score?: number | null
          scraped_at?: string
          shares?: number | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "social_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_profiles: {
        Row: {
          active: boolean
          apify_actor_id: string | null
          avatar_url: string | null
          certifications_summary: string | null
          company: string | null
          company_domain: string | null
          company_industries: string | null
          company_size: string | null
          country: string | null
          created_at: string
          decision_maker_score: number | null
          display_name: string | null
          education_summary: string | null
          email: string | null
          enrich_person_summary: string | null
          first_name: string | null
          followers: number | null
          full_name: string | null
          gtm_relevance: string | null
          id: string
          info_summary: string | null
          is_favorite: boolean
          is_self: boolean
          job_category: string | null
          job_title: string | null
          last_name: string | null
          last_scrape_error: string | null
          last_scrape_status: string | null
          last_scraped_at: string | null
          linkedin_activity_level: string | null
          lists: string[]
          location: string | null
          notes: string | null
          num_followers: number | null
          profile_completeness_score: number | null
          profile_url: string
          scrape_cadence: string
          shared_background: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
          user_id: string
          username: string | null
          work_experience_summary: string | null
        }
        Insert: {
          active?: boolean
          apify_actor_id?: string | null
          avatar_url?: string | null
          certifications_summary?: string | null
          company?: string | null
          company_domain?: string | null
          company_industries?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          decision_maker_score?: number | null
          display_name?: string | null
          education_summary?: string | null
          email?: string | null
          enrich_person_summary?: string | null
          first_name?: string | null
          followers?: number | null
          full_name?: string | null
          gtm_relevance?: string | null
          id?: string
          info_summary?: string | null
          is_favorite?: boolean
          is_self?: boolean
          job_category?: string | null
          job_title?: string | null
          last_name?: string | null
          last_scrape_error?: string | null
          last_scrape_status?: string | null
          last_scraped_at?: string | null
          linkedin_activity_level?: string | null
          lists?: string[]
          location?: string | null
          notes?: string | null
          num_followers?: number | null
          profile_completeness_score?: number | null
          profile_url: string
          scrape_cadence?: string
          shared_background?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          work_experience_summary?: string | null
        }
        Update: {
          active?: boolean
          apify_actor_id?: string | null
          avatar_url?: string | null
          certifications_summary?: string | null
          company?: string | null
          company_domain?: string | null
          company_industries?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          decision_maker_score?: number | null
          display_name?: string | null
          education_summary?: string | null
          email?: string | null
          enrich_person_summary?: string | null
          first_name?: string | null
          followers?: number | null
          full_name?: string | null
          gtm_relevance?: string | null
          id?: string
          info_summary?: string | null
          is_favorite?: boolean
          is_self?: boolean
          job_category?: string | null
          job_title?: string | null
          last_name?: string | null
          last_scrape_error?: string | null
          last_scrape_status?: string | null
          last_scraped_at?: string | null
          linkedin_activity_level?: string | null
          lists?: string[]
          location?: string | null
          notes?: string | null
          num_followers?: number | null
          profile_completeness_score?: number | null
          profile_url?: string
          scrape_cadence?: string
          shared_background?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          work_experience_summary?: string | null
        }
        Relationships: []
      }
      social_review_post_states: {
        Row: {
          edited_body: string | null
          notes: string | null
          platform: string
          post_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          edited_body?: string | null
          notes?: string | null
          platform: string
          post_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          edited_body?: string | null
          notes?: string | null
          platform?: string
          post_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_review_posts: {
        Row: {
          body: string
          created_at: string
          date: string
          id: string
          month: string
          pillar: string
          platform: string
          post_type: string
          source_kind: string
          source_post_id: string | null
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          date?: string
          id?: string
          month?: string
          pillar?: string
          platform: string
          post_type?: string
          source_kind?: string
          source_post_id?: string | null
          topic?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          date?: string
          id?: string
          month?: string
          pillar?: string
          platform?: string
          post_type?: string
          source_kind?: string
          source_post_id?: string | null
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_rss_feeds: {
        Row: {
          active: boolean
          articles_count: number
          cadence: string
          created_at: string
          feed_url: string
          id: string
          label: string | null
          last_fetch_error: string | null
          last_fetch_status: string | null
          last_fetched_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          articles_count?: number
          cadence?: string
          created_at?: string
          feed_url: string
          id?: string
          label?: string | null
          last_fetch_error?: string | null
          last_fetch_status?: string | null
          last_fetched_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          articles_count?: number
          cadence?: string
          created_at?: string
          feed_url?: string
          id?: string
          label?: string | null
          last_fetch_error?: string | null
          last_fetch_status?: string | null
          last_fetched_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_scrape_memory: {
        Row: {
          active: boolean
          created_at: string
          id: string
          reason: string | null
          signal: string
          source: string
          source_post_author: string | null
          source_post_excerpt: string | null
          source_post_id: string | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          reason?: string | null
          signal: string
          source?: string
          source_post_author?: string | null
          source_post_excerpt?: string | null
          source_post_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          reason?: string | null
          signal?: string
          source?: string
          source_post_author?: string | null
          source_post_excerpt?: string | null
          source_post_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_scrape_runs: {
        Row: {
          actor_id: string | null
          actor_input: Json | null
          apify_account_id: string
          cost_usd: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          forced_rotation: boolean
          id: string
          iso_week: number
          iso_year: number
          polling_steps: Json | null
          posts_fetched: number
          profile_id: string
          ran_at: string
          response_excerpt: string | null
          run_url: string | null
          started_at: string | null
          status: string
          user_id: string
          zero_post_reason: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_input?: Json | null
          apify_account_id: string
          cost_usd?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          forced_rotation?: boolean
          id?: string
          iso_week: number
          iso_year: number
          polling_steps?: Json | null
          posts_fetched?: number
          profile_id: string
          ran_at?: string
          response_excerpt?: string | null
          run_url?: string | null
          started_at?: string | null
          status?: string
          user_id: string
          zero_post_reason?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_input?: Json | null
          apify_account_id?: string
          cost_usd?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          forced_rotation?: boolean
          id?: string
          iso_week?: number
          iso_year?: number
          polling_steps?: Json | null
          posts_fetched?: number
          profile_id?: string
          ran_at?: string
          response_excerpt?: string | null
          run_url?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
          zero_post_reason?: string | null
        }
        Relationships: []
      }
      social_search_providers: {
        Row: {
          api_key_secret_name: string
          auth_header_name: string
          auth_header_prefix: string
          created_at: string
          default_body: Json
          default_headers: Json
          endpoint_url: string
          http_method: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          provider_kind: string
          query_field: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_secret_name?: string
          auth_header_name?: string
          auth_header_prefix?: string
          created_at?: string
          default_body?: Json
          default_headers?: Json
          endpoint_url?: string
          http_method?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          provider_kind?: string
          query_field?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_secret_name?: string
          auth_header_name?: string
          auth_header_prefix?: string
          created_at?: string
          default_body?: Json
          default_headers?: Json
          endpoint_url?: string
          http_method?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          provider_kind?: string
          query_field?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_search_queries: {
        Row: {
          answer: string | null
          created_at: string
          depth: string | null
          duration_ms: number | null
          error: string | null
          id: string
          optimized_query: string | null
          output_type: string | null
          provider_id: string | null
          query: string
          raw_response: Json | null
          results: Json | null
          status: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          depth?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          optimized_query?: string | null
          output_type?: string | null
          provider_id?: string | null
          query: string
          raw_response?: Json | null
          results?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          depth?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          optimized_query?: string | null
          output_type?: string | null
          provider_id?: string | null
          query?: string
          raw_response?: Json | null
          results?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_search_queries_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "social_search_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      social_self_snapshots: {
        Row: {
          captured_at: string
          connections: number | null
          followers: number | null
          id: string
          posts_count: number | null
          raw: Json | null
          total_comments: number | null
          total_likes: number | null
          total_shares: number | null
          total_views: number | null
          user_id: string
        }
        Insert: {
          captured_at?: string
          connections?: number | null
          followers?: number | null
          id?: string
          posts_count?: number | null
          raw?: Json | null
          total_comments?: number | null
          total_likes?: number | null
          total_shares?: number | null
          total_views?: number | null
          user_id: string
        }
        Update: {
          captured_at?: string
          connections?: number | null
          followers?: number | null
          id?: string
          posts_count?: number | null
          raw?: Json | null
          total_comments?: number | null
          total_likes?: number | null
          total_shares?: number | null
          total_views?: number | null
          user_id?: string
        }
        Relationships: []
      }
      social_webhook_settings: {
        Row: {
          active: boolean
          created_at: string
          id: string
          json_template: Json
          platform: string
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          json_template?: Json
          platform: string
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          json_template?: Json
          platform?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      social_website_enrichments: {
        Row: {
          created_at: string
          id: string
          per_site: Json
          reference_web_context: string | null
          sites_processed: number
          sites_used: number
          user_id: string
          websites: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          per_site?: Json
          reference_web_context?: string | null
          sites_processed?: number
          sites_used?: number
          user_id: string
          websites?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          per_site?: Json
          reference_web_context?: string | null
          sites_processed?: number
          sites_used?: number
          user_id?: string
          websites?: string[]
        }
        Relationships: []
      }
      social_writer_settings: {
        Row: {
          about_me: string | null
          ai_provider_keys: Json
          ai_provider_models: Json
          ai_task_routing: Json
          anthropic_api_key: string | null
          anthropic_model: string | null
          banned_words: string[] | null
          career_summary: string | null
          comment_target_daily: number
          comment_target_monthly: number
          comment_target_weekly: number
          comment_tones: Json | null
          created_at: string
          custom_system_prompt: string | null
          default_word_limit: number | null
          expertise: string | null
          framework_prompts: Json
          goals: string | null
          id: string
          image_style_prompt: string | null
          last_self_analyzed_at: string | null
          last_voice_enriched_at: string | null
          last_websites_enriched_at: string | null
          linkedin_url: string | null
          lovable_model: string | null
          openai_api_key: string | null
          openai_model: string | null
          preferred_provider: string
          profile_actor_id: string | null
          reference_web_context: string | null
          reference_websites: string[]
          target_audience: string | null
          updated_at: string
          user_id: string
          voice_notes: string | null
          writing_samples: string | null
        }
        Insert: {
          about_me?: string | null
          ai_provider_keys?: Json
          ai_provider_models?: Json
          ai_task_routing?: Json
          anthropic_api_key?: string | null
          anthropic_model?: string | null
          banned_words?: string[] | null
          career_summary?: string | null
          comment_target_daily?: number
          comment_target_monthly?: number
          comment_target_weekly?: number
          comment_tones?: Json | null
          created_at?: string
          custom_system_prompt?: string | null
          default_word_limit?: number | null
          expertise?: string | null
          framework_prompts?: Json
          goals?: string | null
          id?: string
          image_style_prompt?: string | null
          last_self_analyzed_at?: string | null
          last_voice_enriched_at?: string | null
          last_websites_enriched_at?: string | null
          linkedin_url?: string | null
          lovable_model?: string | null
          openai_api_key?: string | null
          openai_model?: string | null
          preferred_provider?: string
          profile_actor_id?: string | null
          reference_web_context?: string | null
          reference_websites?: string[]
          target_audience?: string | null
          updated_at?: string
          user_id: string
          voice_notes?: string | null
          writing_samples?: string | null
        }
        Update: {
          about_me?: string | null
          ai_provider_keys?: Json
          ai_provider_models?: Json
          ai_task_routing?: Json
          anthropic_api_key?: string | null
          anthropic_model?: string | null
          banned_words?: string[] | null
          career_summary?: string | null
          comment_target_daily?: number
          comment_target_monthly?: number
          comment_target_weekly?: number
          comment_tones?: Json | null
          created_at?: string
          custom_system_prompt?: string | null
          default_word_limit?: number | null
          expertise?: string | null
          framework_prompts?: Json
          goals?: string | null
          id?: string
          image_style_prompt?: string | null
          last_self_analyzed_at?: string | null
          last_voice_enriched_at?: string | null
          last_websites_enriched_at?: string | null
          linkedin_url?: string | null
          lovable_model?: string | null
          openai_api_key?: string | null
          openai_model?: string | null
          preferred_provider?: string
          profile_actor_id?: string | null
          reference_web_context?: string | null
          reference_websites?: string[]
          target_audience?: string | null
          updated_at?: string
          user_id?: string
          voice_notes?: string | null
          writing_samples?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          column_id: string
          completed_at: string | null
          contexts: string[] | null
          created_at: string | null
          description: string | null
          due_date: string | null
          energy_required: string | null
          estimated_minutes: number | null
          health_module_link: string | null
          id: string
          is_recurring: boolean | null
          is_two_minute_task: boolean | null
          notes: string | null
          priority: string | null
          project_id: string | null
          recurring_pattern: string | null
          source: Json | null
          status: string
          subtasks: Json | null
          tags: string[] | null
          task_order: number | null
          title: string
          user_id: string
          waiting_for: string | null
        }
        Insert: {
          column_id?: string
          completed_at?: string | null
          contexts?: string[] | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          energy_required?: string | null
          estimated_minutes?: number | null
          health_module_link?: string | null
          id?: string
          is_recurring?: boolean | null
          is_two_minute_task?: boolean | null
          notes?: string | null
          priority?: string | null
          project_id?: string | null
          recurring_pattern?: string | null
          source?: Json | null
          status?: string
          subtasks?: Json | null
          tags?: string[] | null
          task_order?: number | null
          title: string
          user_id: string
          waiting_for?: string | null
        }
        Update: {
          column_id?: string
          completed_at?: string | null
          contexts?: string[] | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          energy_required?: string | null
          estimated_minutes?: number | null
          health_module_link?: string | null
          id?: string
          is_recurring?: boolean | null
          is_two_minute_task?: boolean | null
          notes?: string | null
          priority?: string | null
          project_id?: string | null
          recurring_pattern?: string | null
          source?: Json | null
          status?: string
          subtasks?: Json | null
          tags?: string[] | null
          task_order?: number | null
          title?: string
          user_id?: string
          waiting_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          created_at: string
          date_of_birth: string | null
          fasting_52_enabled: boolean | null
          fasting_52_start_date: string | null
          full_name: string | null
          height_cm: number | null
          id: string
          name: string | null
          preferred_language: string | null
          starting_weight_kg: number | null
          target_weight_final_kg: number | null
          target_weight_m1_kg: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          fasting_52_enabled?: boolean | null
          fasting_52_start_date?: string | null
          full_name?: string | null
          height_cm?: number | null
          id?: string
          name?: string | null
          preferred_language?: string | null
          starting_weight_kg?: number | null
          target_weight_final_kg?: number | null
          target_weight_m1_kg?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          fasting_52_enabled?: boolean | null
          fasting_52_start_date?: string | null
          full_name?: string | null
          height_cm?: number | null
          id?: string
          name?: string | null
          preferred_language?: string | null
          starting_weight_kg?: number | null
          target_weight_final_kg?: number | null
          target_weight_m1_kg?: number | null
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          attempted_at: string
          duration_ms: number | null
          error: string | null
          id: string
          ok: boolean
          plan_id: string | null
          platform: string
          request_payload: Json | null
          response_body: string | null
          response_headers: Json | null
          status_code: number | null
          trigger_kind: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          attempted_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          ok?: boolean
          plan_id?: string | null
          platform: string
          request_payload?: Json | null
          response_body?: string | null
          response_headers?: Json | null
          status_code?: number | null
          trigger_kind?: string
          user_id: string
          webhook_url: string
        }
        Update: {
          attempted_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          ok?: boolean
          plan_id?: string | null
          platform?: string
          request_payload?: Json | null
          response_body?: string | null
          response_headers?: Json | null
          status_code?: number | null
          trigger_kind?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          id: string
          inbox_processed: number | null
          notes: string | null
          projects_reviewed: number | null
          reviewed_at: string | null
          tasks_reviewed: number | null
          user_id: string
        }
        Insert: {
          id?: string
          inbox_processed?: number | null
          notes?: string | null
          projects_reviewed?: number | null
          reviewed_at?: string | null
          tasks_reviewed?: number | null
          user_id: string
        }
        Update: {
          id?: string
          inbox_processed?: number | null
          notes?: string | null
          projects_reviewed?: number | null
          reviewed_at?: string | null
          tasks_reviewed?: number | null
          user_id?: string
        }
        Relationships: []
      }
      youtube_channels: {
        Row: {
          avatar_url: string | null
          channel_id: string
          created_at: string
          description: string | null
          handle: string | null
          id: string
          last_fetched_at: string | null
          last_seen_at: string
          notify_new: boolean
          source_url: string
          subscriber_count: number | null
          title: string | null
          updated_at: string
          uploads_playlist_id: string | null
          user_id: string
          video_count: number | null
          view_count: number | null
        }
        Insert: {
          avatar_url?: string | null
          channel_id: string
          created_at?: string
          description?: string | null
          handle?: string | null
          id?: string
          last_fetched_at?: string | null
          last_seen_at?: string
          notify_new?: boolean
          source_url: string
          subscriber_count?: number | null
          title?: string | null
          updated_at?: string
          uploads_playlist_id?: string | null
          user_id: string
          video_count?: number | null
          view_count?: number | null
        }
        Update: {
          avatar_url?: string | null
          channel_id?: string
          created_at?: string
          description?: string | null
          handle?: string | null
          id?: string
          last_fetched_at?: string | null
          last_seen_at?: string
          notify_new?: boolean
          source_url?: string
          subscriber_count?: number | null
          title?: string | null
          updated_at?: string
          uploads_playlist_id?: string | null
          user_id?: string
          video_count?: number | null
          view_count?: number | null
        }
        Relationships: []
      }
      youtube_videos: {
        Row: {
          channel_id: string
          channel_pk: string
          comment_count: number | null
          description: string | null
          duration_seconds: number | null
          fetched_at: string
          generated_ideas: Json | null
          generated_posts: Json | null
          id: string
          ideas_generated_at: string | null
          is_liked: boolean
          like_count: number | null
          posts_generated_at: string | null
          published_at: string | null
          raw: Json | null
          source: string
          summary_generated_at: string | null
          summary_points: Json | null
          thumbnail_url: string | null
          title: string
          transcript: string | null
          transcript_fetched_at: string | null
          transcript_language: string | null
          transcript_source: string | null
          user_id: string
          video_id: string
          view_count: number | null
        }
        Insert: {
          channel_id: string
          channel_pk: string
          comment_count?: number | null
          description?: string | null
          duration_seconds?: number | null
          fetched_at?: string
          generated_ideas?: Json | null
          generated_posts?: Json | null
          id?: string
          ideas_generated_at?: string | null
          is_liked?: boolean
          like_count?: number | null
          posts_generated_at?: string | null
          published_at?: string | null
          raw?: Json | null
          source?: string
          summary_generated_at?: string | null
          summary_points?: Json | null
          thumbnail_url?: string | null
          title?: string
          transcript?: string | null
          transcript_fetched_at?: string | null
          transcript_language?: string | null
          transcript_source?: string | null
          user_id: string
          video_id: string
          view_count?: number | null
        }
        Update: {
          channel_id?: string
          channel_pk?: string
          comment_count?: number | null
          description?: string | null
          duration_seconds?: number | null
          fetched_at?: string
          generated_ideas?: Json | null
          generated_posts?: Json | null
          id?: string
          ideas_generated_at?: string | null
          is_liked?: boolean
          like_count?: number | null
          posts_generated_at?: string | null
          published_at?: string | null
          raw?: Json | null
          source?: string
          summary_generated_at?: string | null
          summary_points?: Json | null
          thumbnail_url?: string | null
          title?: string
          transcript?: string | null
          transcript_fetched_at?: string | null
          transcript_language?: string | null
          transcript_source?: string | null
          user_id?: string
          video_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_videos_channel_pk_fkey"
            columns: ["channel_pk"]
            isOneToOne: false
            referencedRelation: "youtube_channels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      social_apify_accounts_safe: {
        Row: {
          active: boolean | null
          actor_id: string | null
          actor_input_defaults: Json | null
          apify_checked_at: string | null
          apify_cycle_end: string | null
          apify_limit_usd: number | null
          apify_usage_usd: number | null
          cost_per_10_posts_usd: number | null
          created_at: string | null
          id: string | null
          label: string | null
          last_test_at: string | null
          last_test_status: string | null
          last_used_at: string | null
          monthly_budget_usd: number | null
          period_start: string | null
          posts_used_this_period: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          actor_id?: string | null
          actor_input_defaults?: Json | null
          apify_checked_at?: string | null
          apify_cycle_end?: string | null
          apify_limit_usd?: number | null
          apify_usage_usd?: number | null
          cost_per_10_posts_usd?: number | null
          created_at?: string | null
          id?: string | null
          label?: string | null
          last_test_at?: string | null
          last_test_status?: string | null
          last_used_at?: string | null
          monthly_budget_usd?: number | null
          period_start?: string | null
          posts_used_this_period?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          actor_id?: string | null
          actor_input_defaults?: Json | null
          apify_checked_at?: string | null
          apify_cycle_end?: string | null
          apify_limit_usd?: number | null
          apify_usage_usd?: number | null
          cost_per_10_posts_usd?: number | null
          created_at?: string | null
          id?: string | null
          label?: string | null
          last_test_at?: string | null
          last_test_status?: string | null
          last_used_at?: string | null
          monthly_budget_usd?: number | null
          period_start?: string | null
          posts_used_this_period?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_social_connections: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          expires_at: string
          provider: string
          provider_user_id: string
          scope: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
